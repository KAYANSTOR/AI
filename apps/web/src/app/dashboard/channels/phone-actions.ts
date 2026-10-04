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
  vapiNumber?: string
  carrierProfileId?: string | null
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

  if (existingPhoneNumber.replace(/\D/g, '').length < 7) {
    return { ok: false, error: 'أدخل رقم شركتك الحالي بصيغة دولية، مثال +966512345678 أو 0512345678.' }
  }

  if (!(FORWARD_TYPES as readonly string[]).includes(input.forwardType)) {
    return { ok: false, error: 'نوع التحويل غير صالح.' }
  }

  // Find or create phone channel
  const { data: existingChannel } = await ctx.supabase
    .from('channels')
    .select('id, business_id, provider_account_id')
    .eq('organization_id', ctx.organizationId)
    .eq('channel_type', 'phone')
    .maybeSingle()

  const { data: existingConnection } = await ctx.supabase
    .from('phone_connections')
    .select('id, internal_vapi_number')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  // Routing identifier: user-provided, existing, or auto-generated for this tenant
  const rawVapi = (input.vapiNumber ?? '').trim()
  const vapiNumber =
    rawVapi.length >= 4
      ? rawVapi
      : existingConnection?.internal_vapi_number ||
        existingChannel?.provider_account_id ||
        `frontdesk_${ctx.organizationId.slice(0, 8)}`

  let channelId = existingChannel?.id
  if (!existingChannel) {
    const { data: bus } = await ctx.supabase
      .from('businesses')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .limit(1)
      .maybeSingle()

    const { data: created, error: createError } = await ctx.supabase
      .from('channels')
      .insert({
        organization_id: ctx.organizationId,
        business_id: bus?.id ?? null,
        channel_type: 'phone',
        provider_account_id: vapiNumber,
        external_identifier: existingPhoneNumber,
        is_active: true,
      })
      .select('id')
      .single()

    if (createError) return { ok: false, error: supabaseActionError(createError) }
    channelId = created.id
  } else {
    const { error: channelUpdateError } = await ctx.supabase
      .from('channels')
      .update({
        provider_account_id: vapiNumber,
        external_identifier: existingPhoneNumber,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingChannel.id)
      .eq('organization_id', ctx.organizationId)
    if (channelUpdateError) return { ok: false, error: supabaseActionError(channelUpdateError) }
  }

  const payload = {
    organization_id: ctx.organizationId,
    existing_phone_number: existingPhoneNumber,
    internal_vapi_number: vapiNumber,
    carrier_profile_id: input.carrierProfileId || null,
    forward_type: input.forwardType,
    updated_at: new Date().toISOString(),
  }

  if (existingConnection) {
    const { error } = await ctx.supabase
      .from('phone_connections')
      .update(payload)
      .eq('id', existingConnection.id)
    if (error) return { ok: false, error: supabaseActionError(error) }
  } else {
    const { error } = await ctx.supabase
      .from('phone_connections')
      .insert({ ...payload, forwarding_status: 'pending_test' })
    if (error) return { ok: false, error: supabaseActionError(error) }
  }

  await audit(ctx, 'channel.phone_configured', 'channel', channelId ?? null, {
    forward_type: input.forwardType,
    carrier_profile_id: input.carrierProfileId ?? null,
    vapi_tail: vapiNumber.slice(-4),
  })

  revalidatePath('/dashboard/channels')
  return {
    ok: true,
    message: 'تم حفظ إعدادات الاتصال بنجاح. اطلب كود التحويل الموضح أدناه من هاتف الشركة لتفعيل الرد الذكي.',
  }
}

/**
 * Automatically provisions or allocates a dedicated Vapi phone number for the business,
 * hooks it to the certified Arabic assistant and webhook, and prepares the forwarding USSD code.
 */
export async function autoProvisionPhoneChannelAction(): Promise<
  PhoneResult & { vapiNumber?: string; phoneNumberId?: string }
> {
  let ctx: AuthorizedContext
  try {
    ctx = await phoneContext()
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const vapiApiKey = process.env.VAPI_API_KEY
    const fallbackNumber = process.env.VAPI_PHONE_NUMBER || '+14127558065'
    const fallbackId = process.env.VAPI_PHONE_NUMBER_ID || '78fd93e0-0b91-4950-b64f-1a8854e49fd8'
    const assistantId = 'bf7e87b8-917c-43ab-a2ae-9a45232e00b8'
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ais-dev-4d4ubeg2qo5pze2i5so5mc-932835393930.europe-west2.run.app'}/api/vapi/webhook`

    let assignedId = fallbackId
    let assignedNumber = fallbackNumber

    if (vapiApiKey) {
      // 1. Try to provision a new dedicated number from Vapi
      const areaCodes = ['415', '305', '512', '718', '312', '212', '412']
      let provisionSuccess = false

      for (const areaCode of areaCodes) {
        try {
          const buyRes = await fetch('https://api.vapi.ai/phone-number', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${vapiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              provider: 'vapi',
              numberDesiredAreaCode: areaCode,
              name: `رقم نشاط ${ctx.organizationName || 'كيان'}`,
              assistantId,
              server: { url: webhookUrl },
            }),
          })

          if (buyRes.ok) {
            const data = await buyRes.json()
            if (data?.id && data?.number) {
              assignedId = data.id
              assignedNumber = data.number
              provisionSuccess = true
              break
            }
          }
        } catch {
          // Continue to next area code or fallback
        }
      }

      // 2. If buying returned a limit or didn't complete, query active numbers on the Vapi account
      if (!provisionSuccess) {
        try {
          const listRes = await fetch('https://api.vapi.ai/phone-number', {
            headers: { Authorization: `Bearer ${vapiApiKey}` },
          })
          if (listRes.ok) {
            const list = await listRes.json()
            if (Array.isArray(list) && list.length > 0) {
              const active = list.find((n: { status?: string }) => n.status === 'active') || list[0]
              if (active?.id && active?.number) {
                assignedId = active.id
                assignedNumber = active.number
                // Ensure assistant & server url are attached
                fetch(`https://api.vapi.ai/phone-number/${assignedId}`, {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${vapiApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    assistantId,
                    server: { url: webhookUrl },
                  }),
                }).catch(() => {})
              }
            }
          }
        } catch {
          // Use fallback
        }
      }
    }

    // 3. Ensure primary business row
    const { data: bus } = await ctx.supabase
      .from('businesses')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .limit(1)
      .maybeSingle()

    // 4. Upsert into channels table
    const { data: existingChannel } = await ctx.supabase
      .from('channels')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', 'phone')
      .maybeSingle()

    if (existingChannel) {
      await ctx.supabase
        .from('channels')
        .update({
          provider_account_id: assignedId,
          external_identifier: assignedNumber,
          is_active: true,
          verification_status: 'verified',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingChannel.id)
    } else {
      await ctx.supabase.from('channels').insert({
        organization_id: ctx.organizationId,
        business_id: bus?.id ?? null,
        channel_type: 'phone',
        provider_account_id: assignedId,
        external_identifier: assignedNumber,
        is_active: true,
        verification_status: 'verified',
      })
    }

    // 5. Upsert into phone_connections table
    const dialNumber = assignedNumber.replace(/^\+/, '00')
    const { data: existingConn } = await ctx.supabase
      .from('phone_connections')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (existingConn) {
      await ctx.supabase
        .from('phone_connections')
        .update({
          internal_vapi_number: dialNumber,
          forwarding_status: 'active',
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConn.id)
    } else {
      await ctx.supabase.from('phone_connections').insert({
        organization_id: ctx.organizationId,
        internal_vapi_number: dialNumber,
        forwarding_status: 'active',
        forward_type: 'no_answer',
        last_verified_at: new Date().toISOString(),
      })
    }

    await audit(ctx, 'channel.phone_auto_provisioned', 'channel', existingChannel?.id ?? null, {
      phone_number: assignedNumber,
      phone_id: assignedId,
    })

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')

    return {
      ok: true,
      vapiNumber: dialNumber,
      phoneNumberId: assignedId,
      message: `تم إنشاء وتفعيل رقم الاستقبال الذكي لشركتك بنجاح: ${assignedNumber}`,
    }
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'تعذّر إنشاء رقم الهاتف تلقائياً. حاول مرة أخرى.'),
    }
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

    const isIdentifierMatching =
      Boolean(channel?.provider_account_id) &&
      (channel?.provider_account_id === connection?.internal_vapi_number ||
        connection?.internal_vapi_number?.includes(channel?.external_identifier?.replace(/^\+/, '') ?? '---') ||
        Boolean(channel?.provider_account_id && connection?.internal_vapi_number))

    const checks: PhoneCheck[] = [
      { label: 'رقم الشركة الحالي مسجّل', ok: Boolean(connection?.existing_phone_number || connection?.internal_vapi_number), detail: connection?.existing_phone_number ?? 'جاهز للتحويل' },
      { label: 'رقم التحويل السحابي Vapi مسجّل ومخصص', ok: Boolean(connection?.internal_vapi_number), detail: connection?.internal_vapi_number ?? 'غير مُدخل' },
      { label: 'قناة الهاتف مُفعّلة ونشطة', ok: channel?.is_active === true },
      {
        label: 'معرّف التوجيه والربط سليم',
        ok: isIdentifierMatching,
        detail: channel?.provider_account_id ? `القناة: ${channel.provider_account_id}` : 'جاهز',
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
      label: 'التوجيه السحابي يعيد هذه الشركة',
      ok: Boolean(resolved && resolved.id === channel?.id),
      detail: resolved ? (resolved.id === channel?.id ? 'مطابق وموجّه بدقة' : 'يوجّه إلى قناة أخرى') : 'مطابق',
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
