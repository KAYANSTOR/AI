'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { normalizeChannelNumber } from '@/lib/channels/management'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { ar } from '@/lib/i18n/ar'
import { forwardingStatusLabel } from '@/lib/i18n/labels'

export type PhoneResult = { ok: boolean; error?: string; message?: string }

export type PhoneCheck = { label: string; ok: boolean; detail?: string }

export type PhoneSetupInput = {
  existingPhoneNumber: string
  vapiNumber?: string
  vapiPhoneNumberId?: string
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

  // The spoken destination number and Vapi's webhook routing ID are distinct values.
  const { data: existingChannel, error: channelReadError } = await ctx.db
    .from('channels')
    .select('id, business_id, provider_account_id')
    .eq('organization_id', ctx.organizationId)
    .eq('channel_type', 'phone')
    .maybeSingle()
  if (channelReadError) return { ok: false, error: dbActionError(channelReadError) }

  const { data: existingConnection, error: connectionReadError } = await ctx.db
    .from('phone_connections')
    .select('id, internal_vapi_number')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (connectionReadError) return { ok: false, error: dbActionError(connectionReadError) }

  const vapiNumber = normalizeChannelNumber((input.vapiNumber ?? '').trim())
  const vapiPhoneNumberId = (input.vapiPhoneNumberId ?? '').trim()
  if (vapiNumber.replace(/\D/g, '').length < 7) {
    return { ok: false, error: 'أدخل رقم Vapi السحابي الذي سيستقبل تحويل المكالمات.' }
  }
  if (!vapiPhoneNumberId) {
    return { ok: false, error: 'أدخل معرّف رقم الهاتف من Vapi حتى يطابقه Webhook بدقة.' }
  }

  let channelId = existingChannel?.id
  if (!existingChannel) {
    const { data: bus } = await ctx.db
      .from('businesses')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .limit(1)
      .maybeSingle()

    const { data: created, error: createError } = await ctx.db
      .from('channels')
      .insert({
        organization_id: ctx.organizationId,
        business_id: bus?.id ?? null,
        channel_type: 'phone',
        provider_account_id: vapiPhoneNumberId,
        external_identifier: existingPhoneNumber,
        is_active: true,
      })
      .select('id')
      .single()

    if (createError) return { ok: false, error: dbActionError(createError) }
    channelId = created.id
  } else {
    const { error: channelUpdateError } = await ctx.db
      .from('channels')
      .update({
        provider_account_id: vapiPhoneNumberId,
        external_identifier: existingPhoneNumber,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingChannel.id)
      .eq('organization_id', ctx.organizationId)
    if (channelUpdateError) return { ok: false, error: dbActionError(channelUpdateError) }
  }

  const payload = {
    organization_id: ctx.organizationId,
    existing_phone_number: existingPhoneNumber,
    internal_vapi_number: vapiNumber,
    carrier_profile_id: input.carrierProfileId || null,
    forward_type: input.forwardType,
    forwarding_status: 'pending_test',
    last_verified_at: null,
    updated_at: new Date().toISOString(),
  }

  if (existingConnection) {
    const { error } = await ctx.db
      .from('phone_connections')
      .update(payload)
      .eq('id', existingConnection.id)
    if (error) return { ok: false, error: dbActionError(error) }
  } else {
    const { error } = await ctx.db
      .from('phone_connections')
      .insert({ ...payload, forwarding_status: 'pending_test' })
    if (error) return { ok: false, error: dbActionError(error) }
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
export async function autoProvisionPhoneChannelAction(
  input: Pick<PhoneSetupInput, 'existingPhoneNumber' | 'carrierProfileId' | 'forwardType'>
): Promise<PhoneResult & { vapiNumber?: string; phoneNumberId?: string }> {
  let ctx: AuthorizedContext
  try {
    ctx = await phoneContext()
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const existingPhoneNumber = normalizeChannelNumber(input.existingPhoneNumber ?? '')
    if (existingPhoneNumber.replace(/\D/g, '').length < 7) {
      return { ok: false, error: 'أدخل رقم هاتف شركتك الحالي أولًا.' }
    }
    if (!(FORWARD_TYPES as readonly string[]).includes(input.forwardType)) {
      return { ok: false, error: 'نوع التحويل غير صالح.' }
    }

    const vapiApiKey = process.env.VAPI_API_KEY?.trim()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    const assistantId = process.env.VAPI_ASSISTANT_ID?.trim()
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET?.trim()
    if (!vapiApiKey || !appUrl || !assistantId || !webhookSecret) {
      return {
        ok: false,
        error: 'يتطلب إنشاء رقم صوتي إعداد VAPI_API_KEY وVAPI_ASSISTANT_ID وVAPI_WEBHOOK_SECRET وNEXT_PUBLIC_APP_URL على الخادم. لم يتم تفعيل أي رقم بديل.',
      }
    }

    let webhookUrl: URL
    try {
      webhookUrl = new URL('/api/vapi/webhook', appUrl)
      if (webhookUrl.protocol !== 'https:') throw new Error('HTTPS required')
    } catch {
      return { ok: false, error: 'عنوان التطبيق العام غير صالح أو لا يستخدم HTTPS.' }
    }

    const { data: currentChannel, error: currentChannelError } = await ctx.db
      .from('channels')
      .select('provider_account_id')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', 'phone')
      .maybeSingle()
    if (currentChannelError) throw currentChannelError

    const { data: currentConnection, error: currentConnectionError } = await ctx.db
      .from('phone_connections')
      .select('internal_vapi_number')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (currentConnectionError) throw currentConnectionError

    let assignedId: string | null = currentChannel?.provider_account_id ?? null
    let assignedNumber: string | null = currentConnection?.internal_vapi_number ?? null
    const areaCodes = ['415', '305', '512', '718', '312', '212', '412']
    let provisionSuccess = false

    if (assignedId && assignedNumber) {
      const updateRes = await fetch(`https://api.vapi.ai/phone-number/${encodeURIComponent(assignedId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId,
          server: {
            url: webhookUrl.toString(),
            headers: { Authorization: `Bearer ${webhookSecret}` },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!updateRes.ok) {
        console.error('Vapi existing number update rejected', { status: updateRes.status })
        return { ok: false, error: 'تعذّر تحديث الرقم الموجود في Vapi. لم ننشئ رقمًا إضافيًا؛ تحقق من صلاحيات الحساب ثم أعد المحاولة.' }
      }
      provisionSuccess = true
    } else if (assignedId || assignedNumber) {
      return { ok: false, error: 'بيانات رقم Vapi الحالي غير مكتملة. حدّث الربط يدويًا قبل إنشاء رقم آخر.' }
    }

    for (const areaCode of provisionSuccess ? [] : areaCodes) {
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
            server: {
              url: webhookUrl.toString(),
              headers: { Authorization: `Bearer ${webhookSecret}` },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (buyRes.ok) {
          const data = await buyRes.json()
          if (typeof data?.id === 'string' && typeof data?.number === 'string') {
            assignedId = data.id
            assignedNumber = data.number
            provisionSuccess = true
            break
          }
        } else {
          console.error('Vapi number provisioning rejected', { status: buyRes.status, areaCode })
        }
      } catch (error) {
        console.error('Vapi number provisioning request failed', {
          areaCode,
          reason: error instanceof Error ? error.message : 'unknown_error',
        })
      }
    }

    if (!provisionSuccess || !assignedId || !assignedNumber) {
      return {
        ok: false,
        error: 'لم يتمكن Vapi من إنشاء رقم مخصص. لم نستخدم رقمًا مشتركًا أو احتياطيًا؛ تحقق من رصيد الحساب وإتاحة الأرقام ثم أعد المحاولة.',
      }
    }

    // 3. Ensure primary business row
    const { data: bus, error: businessError } = await ctx.db
      .from('businesses')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .limit(1)
      .maybeSingle()
    if (businessError) throw businessError

    // 4. Upsert into channels table
    const { data: existingChannel, error: channelReadError } = await ctx.db
      .from('channels')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', 'phone')
      .maybeSingle()
    if (channelReadError) throw channelReadError

    const channelWrite = existingChannel
      ? await ctx.db
          .from('channels')
          .update({
            provider_account_id: assignedId,
            external_identifier: assignedNumber,
            is_active: true,
            verification_status: 'verified',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingChannel.id)
          .eq('organization_id', ctx.organizationId)
          .select('id')
          .single()
      : await ctx.db
          .from('channels')
          .insert({
            organization_id: ctx.organizationId,
            business_id: bus?.id ?? null,
            channel_type: 'phone',
            provider_account_id: assignedId,
            external_identifier: assignedNumber,
            is_active: true,
            verification_status: 'verified',
          })
          .select('id')
          .single()
    if (channelWrite.error || !channelWrite.data) {
      throw channelWrite.error ?? new Error('تعذّر حفظ قناة الهاتف.')
    }

    // 5. Upsert the destination separately from Vapi's webhook routing ID.
    const dialNumber = assignedNumber.replace(/^\+/, '00')
    const { data: savedPhoneConnection, error: savedPhoneError } = await ctx.db
      .from('phone_connections')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (savedPhoneError) throw savedPhoneError

    const connectionWrite = savedPhoneConnection
      ? await ctx.db
          .from('phone_connections')
          .update({
            existing_phone_number: existingPhoneNumber,
            internal_vapi_number: dialNumber,
            carrier_profile_id: input.carrierProfileId || null,
            forward_type: input.forwardType,
            forwarding_status: 'pending_test',
            last_verified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', savedPhoneConnection.id)
          .eq('organization_id', ctx.organizationId)
      : await ctx.db.from('phone_connections').insert({
          organization_id: ctx.organizationId,
          existing_phone_number: existingPhoneNumber,
          internal_vapi_number: dialNumber,
          carrier_profile_id: input.carrierProfileId || null,
          forward_type: input.forwardType,
          forwarding_status: 'pending_test',
        })
    if (connectionWrite.error) throw connectionWrite.error

    await audit(ctx, 'channel.phone_auto_provisioned', 'channel', channelWrite.data.id, {
      phone_number: assignedNumber,
      phone_id: assignedId,
    })

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')

    return {
      ok: true,
      vapiNumber: dialNumber,
      phoneNumberId: assignedId,
      message: `تم إنشاء رقم Vapi المخصص: ${assignedNumber}. أكمل حفظ إعدادات التحويل ثم فعّله من شركة الاتصالات.`,
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
      ctx.db
        .from('channels')
        .select('id, is_active, provider_account_id, external_identifier, business_id')
        .eq('organization_id', ctx.organizationId)
        .eq('channel_type', 'phone')
        .maybeSingle(),
      ctx.db
        .from('phone_connections')
        .select('existing_phone_number, internal_vapi_number, forwarding_status, last_verified_at')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle(),
    ])
    if (channelError) throw channelError
    if (connectionError) throw connectionError

    // Resolve with the same exact provider identifier used by the voice webhook.
    const resolved = channel?.provider_account_id
      ? await resolveChannelExact(ctx.db, {
          channelType: 'phone',
          providerAccountId: channel.provider_account_id,
        })
      : null
    const routeMatchesChannel = Boolean(channel?.id && resolved?.id === channel.id)

    const checks: PhoneCheck[] = [
      {
        label: 'رقم الشركة الحالي مسجّل',
        ok: Boolean(connection?.existing_phone_number),
        detail: connection?.existing_phone_number ?? 'غير مُدخل',
      },
      {
        label: 'رقم التحويل السحابي Vapi مسجّل',
        ok: Boolean(connection?.internal_vapi_number),
        detail: connection?.internal_vapi_number ?? 'غير مُدخل',
      },
      { label: 'قناة الهاتف مُفعّلة ونشطة', ok: channel?.is_active === true },
      {
        label: 'معرّف Vapi يوجّه إلى القناة نفسها',
        ok: routeMatchesChannel,
        detail: routeMatchesChannel ? 'مطابق تمامًا' : 'لا يوجد تطابق مؤكد بين معرّف المزود والقناة',
      },
      {
        label: 'حالة التحويل المُعلنة',
        ok: connection?.forwarding_status === 'active',
        detail: forwardingStatusLabel(connection?.forwarding_status ?? 'pending_test'),
      },
    ]

    return { ok: checks.every((check) => check.ok), checks, scope }
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

  const { data: connection, error: connectionError } = await ctx.db
    .from('phone_connections')
    .select('id, existing_phone_number, internal_vapi_number')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (connectionError) return { ok: false, error: dbActionError(connectionError) }
  if (!connection) return { ok: false, error: 'احفظ إعداد الهاتف أولًا.' }

  if (active) {
    const { data: channel, error: channelError } = await ctx.db
      .from('channels')
      .select('is_active, verification_status, provider_account_id')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', 'phone')
      .maybeSingle()
    if (channelError) return { ok: false, error: dbActionError(channelError) }
    if (
      !connection.existing_phone_number ||
      !connection.internal_vapi_number ||
      !channel?.is_active ||
      channel.verification_status !== 'verified' ||
      !channel.provider_account_id
    ) {
      return { ok: false, error: 'أكمل حفظ رقم الشركة وربط قناة Vapi والتحقق منها قبل تأكيد التحويل.' }
    }
  }

  const { error } = await ctx.db
    .from('phone_connections')
    .update({
      forwarding_status: active ? 'active' : 'inactive',
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return { ok: false, error: dbActionError(error) }

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
