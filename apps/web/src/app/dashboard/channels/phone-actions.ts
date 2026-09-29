'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { normalizeChannelNumber } from '@/lib/channels/management'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { ar } from '@/lib/i18n/ar'
import { forwardingStatusLabel } from '@/lib/i18n/labels'

export type PhoneResult = { ok: boolean; error?: string; message?: string }

export type PhoneCheck = { label: string; ok: boolean; detail?: string }

export type PhoneSetupInput = {
  existingPhoneNumber: string
  vapiNumber: string
  forwardType: 'no_answer' | 'busy' | 'unavailable' | 'all'
}

const FORWARD_TYPES = ['no_answer', 'busy', 'unavailable', 'all'] as const

async function phoneContext(): Promise<AuthorizedContext> {
  return requireAdminCapability(null)
}

/** The business keeps its public number; only the Vapi routing identifier changes. */
export async function savePhoneConnectionAction(input: PhoneSetupInput): Promise<PhoneResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await phoneContext()
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const existingPhoneNumber = normalizeChannelNumber(input.existingPhoneNumber ?? '')
  const vapiNumber = (input.vapiNumber ?? '').trim()

  if (existingPhoneNumber.replace(/\D/g, '').length < 7) {
    return { ok: false, error: 'أدخل رقم شركتك الحالي بصيغة دولية، مثال +966512345678.' }
  }
  if (vapiNumber.length < 4) {
    return { ok: false, error: 'أدخل معرّف رقم Vapi كما يظهر في لوحة Vapi.' }
  }
  if (!(FORWARD_TYPES as readonly string[]).includes(input.forwardType)) {
    return { ok: false, error: 'نوع التحويل غير صالح.' }
  }

  // The channel row is what inbound calls resolve against, so the routing identifier and the
  // public number are written there rather than in a parallel structure.
  const { data: channel, error: channelError } = await ctx.supabase
    .from('channels')
    .select('id, business_id')
    .eq('organization_id', ctx.organizationId)
    .eq('channel_type', 'phone')
    .maybeSingle()
  if (channelError) return { ok: false, error: supabaseActionError(channelError) }
  if (!channel) return { ok: false, error: 'قناة الهاتف غير مُهيّأة لهذه الشركة.' }

  const { error: channelUpdateError } = await ctx.supabase
    .from('channels')
    .update({
      provider_account_id: vapiNumber,
      external_identifier: existingPhoneNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', channel.id)
    .eq('organization_id', ctx.organizationId)
  if (channelUpdateError) return { ok: false, error: supabaseActionError(channelUpdateError) }

  const { data: existing } = await ctx.supabase
    .from('phone_connections')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  const payload = {
    organization_id: ctx.organizationId,
    existing_phone_number: existingPhoneNumber,
    internal_vapi_number: vapiNumber,
    forward_type: input.forwardType,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await ctx.supabase.from('phone_connections').update(payload).eq('id', existing.id)
    if (error) return { ok: false, error: supabaseActionError(error) }
  } else {
    const { error } = await ctx.supabase
      .from('phone_connections')
      .insert({ ...payload, forwarding_status: 'pending_test' })
    if (error) return { ok: false, error: supabaseActionError(error) }
  }

  await audit(ctx, 'channel.phone_configured', 'channel', channel.id, {
    forward_type: input.forwardType,
    // The numbers themselves are configuration, not secrets, but only the last digits are
    // recorded so the audit trail stays useful without becoming a directory of numbers.
    vapi_tail: vapiNumber.slice(-4),
  })

  revalidatePath('/dashboard/channels')
  return {
    ok: true,
    message: 'تم حفظ الإعداد. أكمل تحويل المكالمات من رقمك الحالي ثم اختبر الإعداد.',
  }
}

/**
 * Verifies everything that can be verified without placing a call: the routing identifier is
 * stored, the channel is enabled, and the exact resolver the voice webhook uses returns this
 * business. It deliberately does not claim a live call was placed.
 */
export async function verifyPhoneSetupAction(): Promise<{
  ok: boolean
  checks: PhoneCheck[]
  scope: string
  error?: string
}> {
  const scope = ar.channels.phoneCheckScope
  try {
    const ctx = await phoneContext()

    const [
      { data: channel, error: channelError },
      { data: connection, error: connectionError },
    ] = await Promise.all([
      ctx.supabase
        .from('channels')
        .select('id, is_active, provider_account_id, external_identifier, business_id')
        .eq('organization_id', ctx.organizationId)
        .eq('channel_type', 'phone')
        .maybeSingle(),
      ctx.supabase
        .from('phone_connections')
        .select('existing_phone_number, internal_vapi_number, forwarding_status, last_verified_at')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle(),
    ])
    if (channelError) throw channelError
    if (connectionError) throw connectionError

    const checks: PhoneCheck[] = [
      { label: 'رقم الشركة الحالي مسجّل', ok: Boolean(connection?.existing_phone_number), detail: connection?.existing_phone_number ?? 'غير مُدخل' },
      { label: 'معرّف رقم Vapi مسجّل', ok: Boolean(connection?.internal_vapi_number), detail: connection?.internal_vapi_number ?? 'غير مُدخل' },
      { label: 'قناة الهاتف مُفعّلة', ok: channel?.is_active === true },
      {
        label: 'معرّف التوجيه مطابق لما في القناة',
        ok: Boolean(channel?.provider_account_id && channel.provider_account_id === connection?.internal_vapi_number),
        detail: channel?.provider_account_id ? `القناة: ${channel.provider_account_id}` : 'لا يوجد معرّف في القناة',
      },
    ]

    // Reaches the caller's own channel only; the resolver applies the org scope.
    const resolved = channel
      ? await resolveChannelExact(ctx.supabase, {
          channelType: 'phone',
          providerAccountId: channel.provider_account_id,
          externalIdentifier: channel.external_identifier,
        })
      : null
    checks.push({
      label: 'التوجيه يعيد هذه الشركة',
      ok: Boolean(resolved && resolved.id === channel?.id),
      detail: resolved ? (resolved.id === channel?.id ? 'مطابق' : 'يوجّه إلى قناة أخرى') : 'لا يوجد توجيه',
    })

    checks.push({
      label: 'حالة التحويل المُعلنة',
      ok: connection?.forwarding_status === 'active',
      detail: forwardingStatusLabel(connection?.forwarding_status ?? 'pending_test'),
    })

    const ok = checks.filter((check) => check.label !== 'حالة التحويل المُعلنة').every((check) => check.ok)
    return { ok, checks, scope }
  } catch (error) {
    return {
      ok: false,
      checks: [],
      scope,
      error: actionErrorMessage(error, 'تعذّر التحقق. حاول مرة أخرى.'),
    }
  }
}

/**
 * Records the operator's confirmation that the carrier forwarding is live. This is an
 * attestation by a named member, not a system measurement, and it is audited as such.
 */
export async function confirmForwardingAction(active: boolean): Promise<PhoneResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await phoneContext()
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const { data: connection } = await ctx.supabase
    .from('phone_connections')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!connection) return { ok: false, error: 'احفظ إعداد الهاتف أولًا.' }

  const { error } = await ctx.supabase
    .from('phone_connections')
    .update({
      forwarding_status: active ? 'active' : 'inactive',
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return { ok: false, error: supabaseActionError(error) }

  await audit(ctx, active ? 'channel.forwarding_confirmed' : 'channel.forwarding_disabled', 'channel', null, {
    attested_by: ctx.userId,
  })

  revalidatePath('/dashboard/channels')
  return {
    ok: true,
    message: active
      ? 'تم تسجيل تأكيدك بأن تحويل المكالمات مفعّل لدى مزوّد الاتصالات.'
      : 'تم تعليم التحويل كغير مفعّل.',
  }
}
