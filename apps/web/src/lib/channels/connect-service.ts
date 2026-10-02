/**
 * Kayan Connect — server side.
 *
 * Simple path for onboarding:
 *   The customer types their WhatsApp number. We always save it.
 *   If platform credentials exist and the number is found in the WABA, we mark verified.
 *   Otherwise we keep the number as pending. Live inbound still needs Meta Embedded Signup.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isPlausiblePhoneNumber,
  lookupWhatsAppPhoneNumberId,
  WHATSAPP_WABA_ENV,
} from '@/lib/channels/connect'
import { normalizeChannelNumber } from '@/lib/channels/management'

export type WhatsAppBindingOutcome = {
  status: 'verified' | 'pending'
  phoneNumberId: string | null
  displayNumber: string
  reason: 'matched' | 'already_linked' | 'not_found' | 'no_platform_credentials' | 'provider_error'
  message: string
}

function graphBase(): string {
  const configured = process.env.META_GRAPH_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return 'https://graph.facebook.com/v21.0'
}

/**
 * Resolve WhatsApp number → phone_number_id when platform credentials exist.
 * Never throws for missing credentials; returns pending with a clear message.
 */
export async function resolveWhatsAppBinding(input: {
  number: string
}): Promise<WhatsAppBindingOutcome> {
  const displayNumber = normalizeChannelNumber(input.number)
  if (!isPlausiblePhoneNumber(displayNumber)) {
    return {
      status: 'pending',
      phoneNumberId: null,
      displayNumber,
      reason: 'not_found',
      message: 'صيغة الرقم غير صالحة. استخدم الصيغة الدولية مثل +967777123456.',
    }
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const businessAccountId = process.env[WHATSAPP_WABA_ENV]?.trim()
  if (!accessToken || !businessAccountId) {
    return {
      status: 'pending',
      phoneNumberId: null,
      displayNumber,
      reason: 'no_platform_credentials',
      message: 'تم حفظ الرقم فقط. لاستقبال رسائل العملاء اربط واتساب عبر Meta.',
    }
  }

  try {
    const lookup = await lookupWhatsAppPhoneNumberId({
      accessToken,
      businessAccountId,
      number: displayNumber,
      baseUrl: graphBase(),
    })
    if (lookup.ok) {
      return {
        status: 'verified',
        phoneNumberId: lookup.phoneNumberId,
        displayNumber: lookup.displayNumber ?? displayNumber,
        reason: 'matched',
        message: 'تم ربط رقم واتساب بنشاطك.',
      }
    }
    return {
      status: 'pending',
      phoneNumberId: null,
      displayNumber,
      reason: lookup.reason === 'provider_error' ? 'provider_error' : 'not_found',
      message: 'تم حفظ الرقم فقط. لاستقبال رسائل العملاء اربط واتساب عبر Meta.',
    }
  } catch {
    return {
      status: 'pending',
      phoneNumberId: null,
      displayNumber,
      reason: 'provider_error',
      message: 'تم حفظ الرقم فقط. لاستقبال رسائل العملاء اربط واتساب عبر Meta.',
    }
  }
}

export async function connectWhatsAppChannel(input: {
  supabase: SupabaseClient
  organizationId: string
  businessId: string | null
  number: string
}): Promise<{ ok: true; outcome: WhatsAppBindingOutcome } | { ok: false; error: string }> {
  if (!isPlausiblePhoneNumber(input.number)) {
    return { ok: false, error: 'اكتب رقم واتساب بصيغة دولية، مثال +967777123456.' }
  }

  const displayNumber = normalizeChannelNumber(input.number)
  const outcome = await resolveWhatsAppBinding({ number: displayNumber })

  // Prefer admin client so RLS never blocks the save during onboarding.
  let writer: SupabaseClient
  try {
    writer = createAdminClient()
  } catch {
    writer = input.supabase
  }

  const { data: existing } = await writer
    .from('channels')
    .select('id, provider_account_id, verification_status')
    .eq('organization_id', input.organizationId)
    .eq('channel_type', 'whatsapp')
    .maybeSingle()

  if (existing?.provider_account_id && existing.verification_status === 'verified') {
    return {
      ok: true,
      outcome: {
        status: 'verified',
        phoneNumberId: existing.provider_account_id as string,
        displayNumber,
        reason: 'already_linked',
        message: 'رقم واتساب مربوط بنشاطك بالفعل.',
      },
    }
  }

  const patch = {
    ...(input.businessId ? { business_id: input.businessId } : {}),
    provider_account_id: outcome.phoneNumberId,
    external_identifier: displayNumber,
    verification_status: outcome.status === 'verified' ? 'verified' : 'pending',
    is_active: true,
    updated_at: new Date().toISOString(),
  }

  const written = existing
    ? await writer.from('channels').update(patch).eq('id', existing.id).select('id').single()
    : await writer
        .from('channels')
        .insert({
          organization_id: input.organizationId,
          channel_type: 'whatsapp',
          ...patch,
        })
        .select('id')
        .single()

  if (written.error || !written.data) {
    console.error('connectWhatsAppChannel: save failed', written.error)
    return { ok: false, error: 'تعذّر حفظ رقم واتساب. حاول مرة أخرى.' }
  }

  return { ok: true, outcome }
}
