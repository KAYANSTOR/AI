import { isOwnerPauseActive } from '@/lib/runtime/owner-presence'
import type { DbClient } from '@/lib/db/client'
import { createAdminClient } from '@/lib/db/admin'
import { findUserById, normalizePhone } from '@/lib/auth/users'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { getConsentStatus, isOptOutMessage, recordOptOut } from '@/lib/channels/consent'
import { checkEligibility } from '@/lib/channels/eligibility'
import { runAgentTurn } from '@/lib/runtime/agent-runtime'
import { runPersonalAssistantTurn } from '@/lib/personal-assistant/runtime'
import { getPendingAction, isAffirmative, isNegative, markPendingAction } from '@/lib/runtime/pending'
import { ensureOpenConversation, getConversationRef } from '@/lib/runtime/conversation'
import { resolveBusinessAgent } from '@/lib/runtime/tenant'
import { executeTool } from '@/lib/ai/tools'
import { armConversationSla } from '@/lib/sla'
import { isIgnoredPhone, ignoredPhones } from '@/lib/channels/phone-policy'
import { detectHumanHandoffRequest, triggerHumanHandoff } from '@/lib/ai/handoff-alert'
import {
  assertWithinLimit,
  EntitlementExceededError,
  recordMeterUsage,
} from '@/lib/billing/entitlements'
import {
  consumeContactFlood,
  consumeFreeQuota,
  FREE_QUOTA_REPLY,
  freeQuotaFingerprints,
  getAiGuardPolicy,
  truncateForPlan,
  type AiGuardPolicy,
  type QuotaDecision,
  type QuotaKind,
} from '@/lib/billing/free-tier'

export type RuntimeChannel = 'sms' | 'whatsapp' | 'instagram' | 'phone' | 'telegram' | 'messenger'

export type InboundMessageType = 'text' | 'image' | 'audio' | 'video' | 'file'

/** Fair-use guards run right before any model call (injectable for tests). */
export type InboundAiGuards = {
  policy(db: DbClient, organizationId: string): Promise<AiGuardPolicy>
  fingerprints(db: DbClient, input: { organizationId: string; channelId: string }): Promise<string[]>
  consumeQuota(db: DbClient, input: { organizationId: string; fingerprints: string[]; kind: QuotaKind; dailyLimit: number | null; monthlyLimit: number }): Promise<QuotaDecision>
  consumeFlood(db: DbClient, input: { organizationId: string; contactId: string; limit: number; failClosed: boolean }): Promise<boolean>
  /** Wait before the model call so a burst of rapid messages gets one reply. */
  coalesceMs: number
}

async function organizationOwnerPhone(organizationId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('organization_members').select('user_id')
      .eq('organization_id', organizationId).eq('role', 'owner').limit(1).maybeSingle()
    if (!data?.user_id) return null
    const owner = await findUserById(String(data.user_id))
    return owner?.phone ?? null
  } catch {
    return null
  }
}

export function defaultInboundGuards(): InboundAiGuards {
  const configured = Number(process.env.INBOUND_COALESCE_MS)
  return {
    policy: getAiGuardPolicy,
    fingerprints: async (db, input) => freeQuotaFingerprints(db, { ...input, ownerPhone: await organizationOwnerPhone(input.organizationId) }),
    consumeQuota: consumeFreeQuota,
    consumeFlood: consumeContactFlood,
    coalesceMs: Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 10_000) : process.env.NODE_ENV === 'test' ? 0 : 1500,
  }
}

let agentTurnRunner: typeof runAgentTurn = runAgentTurn
/** Test seam: replaces the model call while keeping every guard before it real. */
export function setAgentTurnRunner(runner: typeof runAgentTurn | null) {
  agentTurnRunner = runner ?? runAgentTurn
}

let guardsFactory: (() => InboundAiGuards) | null = null
export function setInboundGuardsFactory(factory: (() => InboundAiGuards) | null) {
  guardsFactory = factory
}
export function inboundGuards(): InboundAiGuards {
  return guardsFactory ? guardsFactory() : defaultInboundGuards()
}

/** True when a newer inbound message exists in the conversation (it will get the reply). */
async function newerInboundExists(db: DbClient, organizationId: string, conversationId: string, messageId: string | null) {
  if (!messageId) return false
  const { data } = await db.from('messages').select('id').eq('organization_id', organizationId)
    .eq('conversation_id', conversationId).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return Boolean(data?.id) && String(data?.id) !== messageId
}

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

async function resolvePersonalAssistantOwner(input: InboundIdentity) {
  if (input.channelType !== 'whatsapp' || !input.senderPhone) return null
  const admin = createAdminClient()
  const { data: settings } = await admin.from('personal_assistant_settings')
    .select('user_id').eq('organization_id', input.organizationId)
    .eq('whatsapp_channel_id', input.channelId).eq('whatsapp_reminders_enabled', true).maybeSingle()
  if (!settings?.user_id) return null
  const { data: membership } = await admin.from('organization_members').select('user_id')
    .eq('organization_id', input.organizationId).eq('user_id', settings.user_id).eq('role', 'owner').maybeSingle()
  if (!membership?.user_id) return null
  const owner = await findUserById(String(membership.user_id))
  if (!owner?.phone || normalizePhone(owner.phone) !== normalizePhone(input.senderPhone)) return null
  return { userId: String(owner.id) }
}

function skipReply(reason: string, input: { organizationId: string; channelId: string }, conversationId: string, contactId: string) {
  // Every silent "no reply" branch is logged so an unanswered message can be
  // traced to its exact cause in the Railway runtime logs.
  console.info('inbound_reply_skipped', { reason, organizationId: input.organizationId, channelId: input.channelId, conversationId })
  return { reply: null, conversationId, contactId }
}

/** Resolve the contact and conversation, then persist the inbound message for the inbox. */
export async function storeInboundMessage(
  db: DbClient,
  input: InboundIdentity & { messageType: InboundMessageType; content: string; media?: Record<string, unknown> | null }
): Promise<{ conversationId: string; contactId: string; messageId: string | null }> {
  // F-003: guard every persistence path (text and pre-stored media) so an
  // excluded number never becomes a business contact, conversation or message.
  if (input.senderPhone && isIgnoredPhone(await ignoredPhones(db, input.organizationId), input.senderPhone)) {
    throw new IgnoredPhoneError(input.organizationId)
  }

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
    sender_type: 'contact',
    ...(input.media ? { media: input.media } : {}),
  }).select('id').maybeSingle()
  if (stored.error && stored.error.code !== '23505') throw new Error(stored.error.message)

  await db
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), last_inbound_at: new Date().toISOString() })
    .eq('id', conversationId)

  await armConversationSla(db, {
    organizationId: input.organizationId,
    conversationId,
  })

  return { conversationId, contactId: contact.contactId, messageId: stored.data?.id ? String(stored.data.id) : null }
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

export type PrestoredInbound = { conversationId: string; contactId: string; messageId: string | null }

export async function processInboundMessage(
  db: DbClient,
  input: InboundIdentity & {
    text: string
    /** The media pipeline already stored the message (with its media metadata). */
    prestored?: PrestoredInbound
    /** The media pipeline already counted this turn against the flood limit and policy. */
    floodChecked?: boolean
    policy?: AiGuardPolicy
  }
): Promise<{ reply: string | null; conversationId: string; contactId: string }> {
  // F-003: the ignored-phone list must be evaluated BEFORE any business contact,
  // conversation, message or SLA record is created, so an excluded number never
  // leaves a trace in business records and never gets a commercial reply.
  if (input.senderPhone && isIgnoredPhone(await ignoredPhones(db, input.organizationId), input.senderPhone)) {
    console.info('inbound_ignored_phone_dropped', { organizationId: input.organizationId, channelId: input.channelId })
    return { reply: null, conversationId: '', contactId: '' }
  }

  const stored = input.prestored ?? await storeInboundMessage(db, { ...input, messageType: 'text', content: input.text })
  const conversationId = stored.conversationId
  const contact = { contactId: stored.contactId }

  const personalOwner = await resolvePersonalAssistantOwner(input)
  if (personalOwner) {
    try {
      const result = await runPersonalAssistantTurn(db, {
        organizationId: input.organizationId,
        userId: personalOwner.userId,
      }, input.text)
      if (stored.messageId) {
        await createAdminClient().from('personal_assistant_extraction_jobs').insert({
          organization_id: input.organizationId,
          user_id: personalOwner.userId,
          conversation_id: conversationId,
          source_message_id: stored.messageId,
        })
      }
      return { reply: result.reply, conversationId, contactId: contact.contactId }
    } catch (error) {
      console.error('personal_assistant_inbound_failed', error)
      return { reply: null, conversationId, contactId: contact.contactId }
    }
  }

  const conversation = await getConversationRef(db, conversationId, input.organizationId)
  if (!conversation || !conversation.aiEnabled || conversation.status === 'handed_off') {
    return skipReply(!conversation ? 'conversation_not_found' : !conversation.aiEnabled ? 'ai_disabled_for_conversation' : 'handed_off_to_human', input, conversationId, contact.contactId)
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
    return skipReply('contact_opted_out', input, conversationId, contact.contactId)
  }

  // Owner presence: while the owner is replying by hand from WhatsApp, the agent stays
  // silent. The message above is already stored; the worker catches up after the pause.
  if (input.channelId && await isOwnerPauseActive(db, { channelId: input.channelId, conversationId })) {
    return skipReply('owner_active_pause', input, conversationId, contact.contactId)
  }

  // Explicit "let me talk to a person" requests are honoured before any model call:
  // the agent stops answering this conversation and the owner is alerted at once.
  if (detectHumanHandoffRequest(input.text)) {
    const handoff = await triggerHumanHandoff(db, {
      organizationId: input.organizationId,
      businessId: input.businessId,
      conversationId,
      contactId: contact.contactId,
      channelId: input.channelId,
      reason: 'customer_requested',
      lastMessage: input.text,
      source: 'customer_request',
    })
    return { reply: handoff.customerReply, conversationId, contactId: contact.contactId }
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
  if (!agent) return skipReply('no_active_agent_or_business_not_live', input, conversationId, contact.contactId)

  const eligibility = checkEligibility({
    channel: input.channelType,
    lastInboundAt: new Date().toISOString(),
    // The opted_out case is returned above, so this branch only sees allowed/unknown consent.
    optedOut: false,
  })
  if (!eligibility.allowed) return skipReply('channel_eligibility_blocked', input, conversationId, contact.contactId)
  if (eligibility.mode === 'template_only' && input.channelType !== 'sms') {
    return skipReply('template_only_window', input, conversationId, contact.contactId)
  }

  const guards = inboundGuards()
  const policy = input.policy ?? await guards.policy(db, input.organizationId)

  // Coalescing: a burst of rapid messages is answered once, by the newest message.
  if (guards.coalesceMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, guards.coalesceMs))
    if (await newerInboundExists(db, input.organizationId, conversationId, stored.messageId)) {
      return skipReply('coalesced_into_newer_message', input, conversationId, contact.contactId)
    }
  }

  // Anti-flood / prompt bombing: N AI calls per minute per contact on any channel.
  if (!input.floodChecked && !await guards.consumeFlood(db, {
    organizationId: input.organizationId, contactId: contact.contactId,
    limit: policy.floodPerMinute, failClosed: policy.free,
  })) {
    return skipReply('contact_flood_limited', input, conversationId, contact.contactId)
  }

  if (policy.free) {
    const decision = await guards.consumeQuota(db, {
      organizationId: input.organizationId,
      fingerprints: await guards.fingerprints(db, { organizationId: input.organizationId, channelId: input.channelId }),
      kind: 'ai',
      dailyLimit: policy.dailyLimit,
      monthlyLimit: policy.monthlyLimit,
    })
    if (!decision.allowed) {
      await db.from('audit_events').insert({
        organization_id: input.organizationId,
        business_id: input.businessId,
        actor_type: 'system',
        action: 'billing.free_quota_exceeded',
        entity_type: 'conversation',
        entity_id: conversationId,
        metadata: { reason: decision.reason, plan: policy.planCode },
      })
      return { reply: FREE_QUOTA_REPLY, conversationId, contactId: contact.contactId }
    }
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
        reply: FREE_QUOTA_REPLY,
        conversationId,
        contactId: contact.contactId,
      }
    }
    throw err
  }

  const reply = await agentTurnRunner({
    db,
    organizationId: input.organizationId,
    businessId: input.businessId,
    conversationId,
    contactId: contact.contactId,
    channel: input.channelType,
    // Media turns are already bounded by the pipeline (≤4,000 document chars, short transcripts).
    userText: input.prestored ? input.text : truncateForPlan(input.text, policy),
    agentId: agent.id,
    serverActionResult,
    maxOutputTokens: policy.maxOutputTokens,
    economy: policy.economy,
    inputCharLimit: policy.free ? policy.maxInputChars : undefined,
  })
  if (!reply) return skipReply('agent_returned_empty_reply', input, conversationId, contact.contactId)

  try {
    await recordMeterUsage(db, input.organizationId, 'ai_messages', 1)
  } catch {
    // meter table may be absent until migration; ledger still records tokens
  }

  return { reply, conversationId, contactId: contact.contactId }
}
