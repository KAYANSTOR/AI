import type { DbClient } from '@/lib/db/client'
import { normalizeE164 } from '@/lib/channels/contacts'

/**
 * Finds the customer's most recent inbound message time for a WhatsApp recipient.
 *
 * The outbox worker needs this to decide between free-form text (inside Meta's
 * 24-hour window) and an approved template (outside it). Everything is scoped to the
 * organization and channel so one tenant's history can never influence another's.
 *
 * Deliberately uses simple, index-friendly equality lookups (no OR/NOT predicates)
 * so it behaves identically on PostgREST and in the in-memory test double.
 */
export async function resolveLastInboundAt(
  db: DbClient,
  input: {
    organizationId: string
    channelId: string
    recipient: string
    conversationId?: string | null
  }
): Promise<string | null> {
  if (input.conversationId) {
    const { data } = await db
      .from('conversations')
      .select('last_inbound_at')
      .eq('id', input.conversationId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()
    if (data?.last_inbound_at) return String(data.last_inbound_at)
  }

  const contactIds = new Set<string>()
  for (const column of ['external_user_id', 'external_phone'] as const) {
    const { data } = await db
      .from('contact_identities')
      .select('contact_id')
      .eq('organization_id', input.organizationId)
      .eq('channel', 'whatsapp')
      .eq(column, input.recipient)
      .limit(5)
    for (const row of data ?? []) if (row.contact_id) contactIds.add(String(row.contact_id))
  }

  const normalized = normalizeE164(input.recipient)
  if (normalized) {
    const { data: contacts } = await db
      .from('contacts')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('phone', normalized)
      .limit(5)
    for (const row of contacts ?? []) if (row.id) contactIds.add(String(row.id))
  }

  if (!contactIds.size) return null

  const { data: conversations } = await db
    .from('conversations')
    .select('last_inbound_at')
    .eq('organization_id', input.organizationId)
    .eq('channel_id', input.channelId)
    .in('contact_id', [...contactIds])
    .order('last_inbound_at', { ascending: false })
    .limit(10)

  let latest: string | null = null
  for (const row of conversations ?? []) {
    const value = row.last_inbound_at ? String(row.last_inbound_at) : null
    if (!value) continue
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) latest = value
  }
  return latest
}
