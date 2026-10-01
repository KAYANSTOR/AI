/**
 * Kayan Connect — server side.
 *
 * The customer types the WhatsApp number their business already uses; the service turns it
 * into the provider binding. Resolution order:
 *   1. the number is already bound to this channel (same digits) — nothing to resolve;
 *   2. a per-channel credential or the operator fallback gives an access token and a
 *      WhatsApp Business Account, so the phone_number_id is looked up at the provider;
 *   3. otherwise the number is stored as "pending" and the UI offers a retry from the same
 *      screen. A pending number is never presented as connected.
 *
 * Provider identifiers never reach the browser through this module: callers receive the
 * connection outcome, and the advanced diagnostics panel asks for the row itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeChannelNumber } from '@/lib/channels/management'
import { loadChannelCredentials } from '@/lib/credentials/service'
import { platformCredentials } from '@/lib/credentials/resolve'
import {
  WHATSAPP_WABA_ENV,
  isPlausiblePhoneNumber,
  lookupWhatsAppPhoneNumberId,
  phoneDigits,
  type WhatsAppLookupResult,
} from '@/lib/channels/connect'

export type WhatsAppBindingReason =
  | 'already_bound'
  | 'provider_lookup'
  | 'no_credentials'
  | 'not_found'
  | 'provider_error'

export type WhatsAppBindingOutcome = {
  status: 'verified' | 'pending'
  reason: WhatsAppBindingReason
  /** Present only for advanced diagnostics; never rendered in the normal path. */
  phoneNumberId: string | null
  message: string
}

export type WhatsAppChannelRow = {
  id: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

function required(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Credentials for this channel, tolerating a platform that cannot store them yet. */
async function channelCredentials(supabase: SupabaseClient, channelId: string | null) {
  if (!channelId) return {} as Record<string, string>
  try {
    return await loadChannelCredentials(supabase, channelId)
  } catch (error) {
    // A missing encryption key must not break connecting; it only means no per-channel
    // credential exists yet, and the operator fallback (if enabled) still applies.
    console.error('Connect: unable to load stored channel credentials', error)
    return {} as Record<string, string>
  }
}

export async function resolveWhatsAppBinding(input: {
  supabase: SupabaseClient
  channel: WhatsAppChannelRow | null
  number: string
}): Promise<WhatsAppBindingOutcome> {
  const number = normalizeChannelNumber(input.number)
  const digits = phoneDigits(number)

  // 1. The same number is already bound to this channel: keep the existing binding instead
  //    of downgrading a working connection just because a lookup was not possible now.
  if (
    input.channel?.provider_account_id &&
    input.channel.verification_status === 'verified' &&
    phoneDigits(input.channel.external_identifier ?? '') === digits
  ) {
    return {
      status: 'verified',
      reason: 'already_bound',
      phoneNumberId: input.channel.provider_account_id,
      message: 'رقم واتساب مربوط بنشاطك بالفعل.',
    }
  }

  const stored = await channelCredentials(input.supabase, input.channel?.id ?? null)
  const platform = platformCredentials('whatsapp')
  const accessToken = required(stored.access_token) ?? required(platform.access_token)
  const businessAccountId =
    required(stored.business_account_id) ?? required(process.env[WHATSAPP_WABA_ENV])
  const graphBase = required(process.env.META_GRAPH_BASE_URL)

  if (!accessToken || !businessAccountId || !graphBase) {
    return {
      status: 'pending',
      reason: 'no_credentials',
      phoneNumberId: null,
      message:
        'حفظنا رقمك، وسنكمل التحقق من واتساب تلقائياً. إن لم يكتمل خلال دقائق اضغط «إعادة المحاولة».',
    }
  }

  const lookup: WhatsAppLookupResult = await lookupWhatsAppPhoneNumberId({
    accessToken,
    businessAccountId,
    number,
    baseUrl: graphBase,
  })

  if (lookup.ok) {
    return {
      status: 'verified',
      reason: 'provider_lookup',
      phoneNumberId: lookup.phoneNumberId,
      message: 'تم ربط رقم واتساب بنشاطك.',
    }
  }

  if (lookup.reason === 'provider_error') {
    console.error('Connect: WhatsApp provider lookup failed', {
      reason: lookup.reason,
      detail: lookup.detail,
    })
  }

  return {
    status: 'pending',
    reason: lookup.reason,
    phoneNumberId: null,
    message:
      lookup.reason === 'not_found'
        ? 'لم نجد هذا الرقم داخل حساب واتساب للأعمال بعد. تأكد من الرقم ثم اضغط «إعادة المحاولة».'
        : 'لم يكتمل ربط واتساب بعد. اضغط «إعادة المحاولة» لإكمال الربط.',
  }
}

export type ConnectChannelResult =
  | { ok: true; outcome: WhatsAppBindingOutcome }
  | { ok: false; error: string }

/**
 * Writes the WhatsApp channel for this number. The write deliberately happens even when the
 * provider could not be reached: the business now has a recorded intent and a retry path,
 * the row is marked `pending`, and activation still refuses to treat it as verified.
 */
export async function connectWhatsAppChannel(input: {
  supabase: SupabaseClient
  organizationId: string
  businessId: string | null
  number: string
}): Promise<ConnectChannelResult> {
  const number = normalizeChannelNumber(input.number)
  if (!isPlausiblePhoneNumber(number)) {
    return { ok: false, error: 'أدخل رقم واتساب بصيغة دولية، مثال +967777123456.' }
  }

  try {
    const { data: existing, error: readError } = await input.supabase
      .from('channels')
      .select('id, provider_account_id, external_identifier, verification_status, is_active')
      .eq('organization_id', input.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

    if (readError) {
      console.error('Connect: unable to load WhatsApp channel', readError)
      return { ok: false, error: 'تعذّر التحقق من إعدادات واتساب. حاول مرة أخرى.' }
    }

    const channel = (existing as WhatsAppChannelRow | null) ?? null
    const outcome = await resolveWhatsAppBinding({
      supabase: input.supabase,
      channel,
      number,
    })

    const patch = {
      ...(input.businessId ? { business_id: input.businessId } : {}),
      provider_account_id: outcome.phoneNumberId,
      external_identifier: number,
      verification_status: outcome.status === 'verified' ? 'verified' : 'pending',
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    const written = channel
      ? await input.supabase.from('channels').update(patch).eq('id', channel.id).select('id').single()
      : await input.supabase
          .from('channels')
          .insert({ organization_id: input.organizationId, channel_type: 'whatsapp', ...patch })
          .select('id')
          .single()

    if (written.error || !written.data) {
      console.error('Connect: unable to save WhatsApp channel', written.error)
      return { ok: false, error: 'تعذّر حفظ رقم واتساب. حاول مرة أخرى.' }
    }

    return { ok: true, outcome }
  } catch (error) {
    console.error('Connect: unexpected WhatsApp connection failure', error)
    return { ok: false, error: 'تعذّر ربط واتساب الآن. حاول مرة أخرى.' }
  }
}
