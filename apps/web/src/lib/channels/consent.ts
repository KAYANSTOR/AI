import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Consent is a channel-level fact stored in `consents` (DB contract: consents).
 * The runtime only writes explicit customer opt-out and reads it before any
 * automated reply, so an opted-out contact is never messaged again by automation.
 */
const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'stop all',
  'الغاء',
  'إلغاء',
  'توقف',
  'ايقاف',
  'إيقاف',
  'لا تراسلني',
  'لا مزيد من الرسائل',
])

function normalize(text: string) {
  return text.trim().toLocaleLowerCase('ar').replace(/[.!؟?،]+$/g, '').trim()
}

export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(normalize(text))
}

export async function getConsentStatus(
  supabase: SupabaseClient,
  contactId: string,
  channel: string
): Promise<'opted_in' | 'opted_out' | 'unknown' | null> {
  const { data, error } = await supabase
    .from('consents')
    .select('status')
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.status as 'opted_in' | 'opted_out' | 'unknown' | undefined) ?? null
}

export async function recordOptOut(
  supabase: SupabaseClient,
  input: { organizationId: string; contactId: string; channel: string; source: string }
): Promise<void> {
  const { error } = await supabase.from('consents').insert({
    organization_id: input.organizationId,
    contact_id: input.contactId,
    channel: input.channel,
    purpose: 'marketing',
    status: 'opted_out',
    source: input.source,
    revoked_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}
