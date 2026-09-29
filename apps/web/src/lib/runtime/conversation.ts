import type { SupabaseClient } from '@supabase/supabase-js'

export type ConversationRef = {
  id: string
  organizationId: string
  businessId: string | null
  contactId: string
  channelId: string
  state: string | null
  status: string
  aiEnabled: boolean
}

/**
 * One conversation model for every channel.
 *
 * A conversation is "open" when it is not closed, so `handed_off` stays open and keeps
 * the human in control. Openness is unique per (organization, contact, channel) and is
 * enforced in the database by ux_conversation_open. Every runtime entry point
 * (WhatsApp, Instagram, SMS, Phone) resolves or creates conversations through this
 * function instead of keeping its own copy of the rule.
 *
 * This deliberately does NOT look for status='active': doing so treated a
 * human-taken-over conversation as absent and opened a fresh, AI-enabled one, which
 * silently undid the handoff.
 */
export async function ensureOpenConversation(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    businessId: string | null
    contactId: string
    channelId: string
  }
): Promise<string> {
  const existing = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('contact_id', input.contactId)
    .eq('channel_id', input.channelId)
    .neq('status', 'closed')
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data?.id) return existing.data.id

  const created = await supabase
    .from('conversations')
    .insert({
      organization_id: input.organizationId,
      business_id: input.businessId,
      contact_id: input.contactId,
      channel_id: input.channelId,
      status: 'active',
      state: 'discovery',
      ai_enabled: true,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!created.error && created.data?.id) return created.data.id

  // Concurrent webhook deliveries can insert at the same time; the unique index
  // wins and the loser re-reads the winner's row.
  if (created.error?.code === '23505') {
    const retry = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('contact_id', input.contactId)
      .eq('channel_id', input.channelId)
      .neq('status', 'closed')
      .maybeSingle()
    if (retry.data?.id) return retry.data.id
    throw new Error(retry.error?.message ?? 'conversation_create_race')
  }

  throw new Error(created.error?.message ?? 'conversation_create_failed')
}

export async function getConversationRef(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationRef | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, organization_id, business_id, contact_id, channel_id, state, status, ai_enabled')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    id: data.id,
    organizationId: data.organization_id,
    businessId: data.business_id,
    contactId: data.contact_id,
    channelId: data.channel_id,
    state: data.state,
    status: data.status,
    aiEnabled: data.ai_enabled !== false,
  }
}
