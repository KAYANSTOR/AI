import type { DbClient } from '@/lib/db/client'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { getConsentStatus, isOptOutMessage, recordOptOut } from '@/lib/channels/consent'
import { checkEligibility } from '@/lib/channels/eligibility'
import { runAgentTurn } from '@/lib/runtime/agent-runtime'
import { getPendingAction, isAffirmative, isNegative, markPendingAction } from '@/lib/runtime/pending'
import { ensureOpenConversation, getConversationRef } from '@/lib/runtime/conversation'
import { resolveBusinessAgent } from '@/lib/runtime/tenant'
import { executeTool } from '@/lib/ai/tools'
import { armConversationSla } from '@/lib/sla'
import {
  assertWithinLimit,
  EntitlementExceededError,
  recordMeterUsage,
} from '@/lib/billing/entitlements'

export type RuntimeChannel = 'sms' | 'whatsapp' | 'instagram' | 'phone'

export type InboundMessageType = 'text' | 'image' | 'audio' | 'video' | 'file'

type InboundIdentity = {
  organizationId: string
  businessId: string
  channelId: string
  channelType: RuntimeChannel
  provider: string
  externalEventId: string
  externalUserId?: string | null
  senderPhone?: string | null
  senderUsername?: string | null
  displayName?: string | null
}

/** Resolve the contact and conversation, then persist the inbound message for the inbox. */
async function storeInboundMessage(
  db: DbClient,
  input: InboundIdentity & { messageType: InboundMessageType; content: string }
): Promise<{ conversationId: string; contactId: string }> {
  const contact = await resolveContactIdentity(db, input.organizationId, {
    channel: input.channelType,
    externalUserId: input.externalUserId,
    externalUsername: input.senderUsername,
    phone: input.senderPhone,
    displayName: input.displayName,
  })

  const conversationId = await ensureOpenConversation(db, {
    organizationId: input.organizationId,
    businessId: input.businessId,
    contactId: contact.contactId,
    channelId: input.channelId,
  })

  const stored = await db.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: conversationId,
    direction: 'inbound',
    message_type: input.messageType,
    content: input.content,
    external_message_id: input.externalEventId,
  })
  if (stored.error && stored.error.code !== '23505') throw new Error(stored.error.message)

  await db
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), last_inbound_at: new Date().toISOString() })
    .eq('id', conversationId)

  await armConversationSla(db, {
    organizationId: input.organizationId,
    conversationId,
  })

  return { conversationId, contactId: contact.contactId }
}

/**
 * Non-text inbound (image, voice note, video, document, location…). The agent
 * cannot read media, so the message is recorded in the inbox and the SLA is
 * armed for a human to follow up; no automated reply is produced.
 */
export async function recordInboundMediaMessage(
  db: DbClient,
  input: InboundIdentity & { messageType: Exclude<InboundMessageType, 'text'>; content: string }
): Promise<{ conversationId: string; contactId: string }> {
  return storeInboundMessage(db, input)
}

export async function processInboundMessage(
  db: DbClient,
  input: InboundIdentity & { text: string }
): Promise<{ reply: string | null; conversationId: string; contactId: string }> {
  const stored = await storeInboundMessage(db, { ...input, messageType: 'text', content: input.text })
  const conversationId = stored.conversationId
  const contact = { contactId: stored.contactId }

  const conversation = await getConversationRef(db, conversationId, input.organizationId)
  if (!conversation || !conversation.aiEnabled || conversation.status === 'handed_off') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  if (isOptOutMessage(input.text)) {
    await recordOptOut(db, {
      organizationId: input.organizationId,
      contactId: contact.contactId,
      channel: input.channelType,
      source: input.provider + '_inbound',
    })
    await db.from('audit_events').insert({
      organization_id: input.organizationId,
      business_id: input.businessId,
      actor_type: 'provider',
      action: 'consent.opted_out',
      entity_type: 'contact',
      entity_id: contact.contactId,
      metadata: { channel: input.channelType, source: input.provider },
    })
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  const consent = await getConsentStatus(db, contact.contactId, input.channelType)
  if (consent === 'opted_out') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  let serverActionResult: unknown
  const pending = await getPendingAction(db, conversationId)

  if (pending && isNegative(input.text)) {
    const cancelled = await markPendingAction(db, pending.id, 'cancelled')
    if (!cancelled) return { reply: 'تمت معالجة العملية مسبقًا.', conversationId, contactId: contact.contactId }
    await db.from('conversations').update({ state: 'waiting_customer' }).eq('id', conversationId)
    return {
      reply: 'تم إلغاء العملية. أخبرني عندما تريد المتابعة.',
      conversationId,
      contactId: contact.contactId,
    }
  }

  if (pending && isAffirmative(input.text)) {
    const confirmed = await markPendingAction(db, pending.id, 'confirmed')
    if (!confirmed) return { reply: 'هذه العملية قيد المعالجة بالفعل.', conversationId, contactId: contact.contactId }
    const agent = await resolveBusinessAgent(db, input.businessId)
    const actionResult = await executeTool(
      pending.tool_name,
      pending.arguments,
      {
        organizationId: input.organizationId,
        businessId: input.businessId,
        conversationId,
        contactId: contact.contactId,
        db,
        agentId: agent?.id ?? null,
        actor: 'agent',
      },
      { confirmed: true }
    )
    serverActionResult = actionResult.ok ? actionResult.result : { error: actionResult.error }
    await markPendingAction(db, pending.id, actionResult.ok ? 'executed' : 'failed', serverActionResult, 'confirmed')
    await db
      .from('conversations')
      .update({ state: actionResult.ok ? 'completed' : 'action_pending' })
      .eq('id', conversationId)
  }

  const agent = await resolveBusinessAgent(db, input.businessId)
  if (!agent) return { reply: null, conversationId, contactId: contact.contactId }

  const eligibility = checkEligibility({
    channel: input.channelType,
    lastInboundAt: new Date().toISOString(),
    // The opted_out case is returned above, so this branch only sees allowed/unknown consent.
    optedOut: false,
  })
  if (!eligibility.allowed) return { reply: null, conversationId, contactId: contact.contactId }
  if (eligibility.mode === 'template_only' && input.channelType !== 'sms') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  try {
    await assertWithinLimit(db, input.organizationId, 'ai_messages', 1)
  } catch (err) {
    if (err instanceof EntitlementExceededError) {
      await db.from('audit_events').insert({
        organization_id: input.organizationId,
        business_id: input.businessId,
        actor_type: 'system',
        action: 'billing.ai_limit_exceeded',
        entity_type: 'conversation',
        entity_id: conversationId,
        metadata: { meter: err.meter, used: err.used, limit: err.limit },
      })
      return {
        reply: 'نعتذر، تم استهلاك حصة الردود الذكية لهذه الفترة. سيتابع أحد أعضاء الفريق قريبًا.',
        conversationId,
        contactId: contact.contactId,
      }
    }
    throw err
  }

  const reply = await runAgentTurn({
    db,
    organizationId: input.organizationId,
    businessId: input.businessId,
    conversationId,
    contactId: contact.contactId,
    channel: input.channelType,
    userText: input.text,
    agentId: agent.id,
    serverActionResult,
  })
  if (!reply) return { reply: null, conversationId, contactId: contact.contactId }

  try {
    await recordMeterUsage(db, input.organizationId, 'ai_messages', 1)
  } catch {
    // meter table may be absent until migration; ledger still records tokens
  }

  return { reply, conversationId, contactId: contact.contactId }
}
