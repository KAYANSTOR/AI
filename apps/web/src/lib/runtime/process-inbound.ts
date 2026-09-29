import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { getConsentStatus, isOptOutMessage, recordOptOut } from '@/lib/channels/consent'
import { checkEligibility } from '@/lib/channels/eligibility'
import { runAgentTurn } from '@/lib/runtime/agent-runtime'
import { getPendingAction, isAffirmative, isNegative, markPendingAction } from '@/lib/runtime/pending'
import { ensureOpenConversation, getConversationRef } from '@/lib/runtime/conversation'
import { resolveBusinessAgent } from '@/lib/runtime/tenant'
import { executeTool } from '@/lib/ai/tools'

/** Provider channels that terminate in an agent conversation. */
export type RuntimeChannel = 'sms' | 'whatsapp' | 'instagram' | 'phone'

/**
 * The single inbound runtime for every message channel:
 * identity → conversation → persist → consent/eligibility → agent → outbound.
 */
export async function processInboundMessage(
  supabase: SupabaseClient,
  input: {
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
    text: string
  }
): Promise<{ reply: string | null; conversationId: string; contactId: string }> {
  const contact = await resolveContactIdentity(supabase, input.organizationId, {
    channel: input.channelType,
    externalUserId: input.externalUserId,
    externalUsername: input.senderUsername,
    phone: input.senderPhone,
    displayName: input.displayName,
  })

  const conversationId = await ensureOpenConversation(supabase, {
    organizationId: input.organizationId,
    businessId: input.businessId,
    contactId: contact.contactId,
    channelId: input.channelId,
  })

  const stored = await supabase.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: conversationId,
    direction: 'inbound',
    message_type: 'text',
    content: input.text,
    external_message_id: input.externalEventId,
  })
  if (stored.error && stored.error.code !== '23505') throw new Error(stored.error.message)

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), last_inbound_at: new Date().toISOString() })
    .eq('id', conversationId)

  const conversation = await getConversationRef(supabase, conversationId)
  if (!conversation || !conversation.aiEnabled || conversation.status === 'handed_off') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  // Explicit customer opt-out is a channel fact: store it and stop automation.
  if (isOptOutMessage(input.text)) {
    await recordOptOut(supabase, {
      organizationId: input.organizationId,
      contactId: contact.contactId,
      channel: input.channelType,
      source: input.provider + '_inbound',
    })
    await supabase.from('audit_events').insert({
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

  const consent = await getConsentStatus(supabase, contact.contactId, input.channelType)
  if (consent === 'opted_out') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  let serverActionResult: unknown
  const pending = await getPendingAction(supabase, conversationId)

  if (pending && isNegative(input.text)) {
    await markPendingAction(supabase, pending.id, 'cancelled')
    await supabase.from('conversations').update({ state: 'waiting_customer' }).eq('id', conversationId)
    return {
      reply: 'تم إلغاء العملية. أخبرني عندما تريد المتابعة.',
      conversationId,
      contactId: contact.contactId,
    }
  }

  if (pending && isAffirmative(input.text)) {
    await markPendingAction(supabase, pending.id, 'confirmed')
    const agent = await resolveBusinessAgent(supabase, input.businessId)
    const actionResult = await executeTool(
      pending.tool_name,
      pending.arguments,
      {
        organizationId: input.organizationId,
        businessId: input.businessId,
        conversationId,
        contactId: contact.contactId,
        supabase,
        agentId: agent?.id ?? null,
      },
      { confirmed: true }
    )
    serverActionResult = actionResult.ok ? actionResult.result : { error: actionResult.error }
    await markPendingAction(supabase, pending.id, actionResult.ok ? 'executed' : 'failed', serverActionResult)
    await supabase
      .from('conversations')
      .update({ state: actionResult.ok ? 'completed' : 'action_pending' })
      .eq('id', conversationId)
  }

  const agent = await resolveBusinessAgent(supabase, input.businessId)
  if (!agent) return { reply: null, conversationId, contactId: contact.contactId }

  // A just-received inbound message opens the reply window for this conversation.
  const eligibility = checkEligibility({
    channel: input.channelType,
    lastInboundAt: new Date().toISOString(),
  })
  if (!eligibility.allowed) return { reply: null, conversationId, contactId: contact.contactId }
  if (eligibility.mode === 'template_only' && input.channelType !== 'sms') {
    return { reply: null, conversationId, contactId: contact.contactId }
  }

  const reply = await runAgentTurn({
    supabase,
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

  const outbound = await supabase.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: reply,
  })
  if (outbound.error) throw new Error(outbound.error.message)

  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_outbound_at: new Date().toISOString(),
      state: serverActionResult ? 'completed' : 'waiting_customer',
    })
    .eq('id', conversationId)

  return { reply, conversationId, contactId: contact.contactId }
}
