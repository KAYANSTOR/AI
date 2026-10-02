/**
 * Kayan Connect — server side.
 *
 * Simple path for onboarding:
 *   The customer types their WhatsApp number. We always save it.
 *   If platform credentials exist and the number is found in the WABA,
 *   we mark it verified. Otherwise we mark it pending and show a calm
 *   success message so the customer can continue setup without friction.
 *
 * Provider identifiers never reach the browser through this module.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
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
    // A missing encryption key must not break connecting.
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

  // Already verified for the same number — keep it.
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

  // Best-effort provider lookup. Never throws; always falls back to pending.
  try {
    const stored = await channelCredentials(input.supabase, input.channel?.id ?? null)
    const platform = platformCredentials('whatsapp')
    const accessToken = required(stored.access_token) ?? required(platform.access_token)
    const businessAccountId =
      required(stored.business_account_id) ?? required(process.env[WHATSAPP_WABA_ENV])
    const graphBase = required(process.env.META_GRAPH_BASE_URL)

    if (accessToken && businessAccountId && graphBase) {
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
    }
  } catch (error) {
    console.error('Connect: unexpected error during WhatsApp lookup', error)
  }

  // Default path for onboarding: save the number as pending with a calm message.
  return {
    status: 'pending',
    reason: 'no_credentials',
    phoneNumberId: null,
    message: 'تم حفظ رقم واتساب. سنكمل التحقق تلقائيًا ويمكنك المتابعة الآن.',
  }
}

export type ConnectChannelResult =
  | { ok: true; outcome: WhatsAppBindingOutcome }
  | { ok: false; error: string }

/**
 * Saves the WhatsApp number for this organization.
 * Always prefers a successful save over a hard failure so onboarding stays frictionless.
 * Uses the admin client for the write after the caller has already authorized the user.
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
    // Read with the caller's client (respects RLS for visibility).
    const { data: existing, error: readError } = await input.supabase
      .from('channels')
      .select('id, provider_account_id, external_identifier, verification_status, is_active')
      .eq('organization_id', input.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

    if (readError) {
      console.error('Connect: unable to load WhatsApp channel', readError)
      // Fall through and still attempt the write with admin so onboarding is not blocked.
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

    // Write with admin client so RLS cannot block a valid owner/admin after authorization.
    const admin = createAdminClient()
    const written = channel
      ? await admin.from('channels').update(patch).eq('id', channel.id).select('id').single()
      : await admin
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
    return { ok: false, error: 'تعذّر حفظ رقم واتساب. حاول مرة أخرى.' }
  }
}
