'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { ar } from '@/lib/i18n/ar'
import {
  getChannelSpec,
  normalizeChannelNumber,
  verifyChannelBinding,
  type BindingTestResult,
  type ChannelRow,
} from '@/lib/channels/management'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'
import { connectWhatsAppChannel } from '@/lib/channels/connect-service'
import { verifyMetaChannelConnection } from '@/lib/channels/meta-verification'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/db/admin'
import { saveChannelCredential, loadChannelCredentials, deleteChannelCredential } from '@/lib/credentials/service'
import { configureTelegramWebhook, verifyTelegramBot, verifyTelegramWebhook } from '@/lib/providers/telegram'
import { createEmbeddedSignupOAuthState, verifyEmbeddedSignupOAuthState } from '@/lib/channels/embedded-signup'
import { ensureMessengerAppWebhook, getMessengerPage, listMessengerPages, subscribeMessengerPage, verifyMessengerPage, verifyMessengerPermissions } from '@/lib/providers/messenger'
import { callWhatsAppGateway, type WhatsAppGatewaySession } from '@/lib/providers/whatsapp-gateway'

export type ChannelActionResult = {
  ok: boolean
  error?: string
  message?: string
}

async function requireChannelAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية إدارة القنوات متاحة للمالك أو المسؤول فقط.')
  }
  return org
}

/**
 * Channels.business_id FK points at businesses(id).
 * Signup may only seed business_profiles — ensure a businesses row exists.
 */
async function ensurePrimaryBusinessId(
  organizationId: string,
  organizationName?: string
): Promise<string | null> {
  const db = await createClient()

  const { data: existing } = await db
    .from('businesses')
    .select('id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: profile } = await db
    .from('business_profiles')
    .select('business_id, display_name, name')
    .eq('organization_id', organizationId)
    .maybeSingle()

  // If profile already points at a valid businesses row, use it.
  if (profile?.business_id) {
    const { data: byId } = await db
      .from('businesses')
      .select('id')
      .eq('id', profile.business_id)
      .maybeSingle()
    if (byId?.id) return byId.id as string
  }

  const name =
    (profile?.display_name as string | undefined) ||
    (profile?.name as string | undefined) ||
    organizationName ||
    'Business'

  const { data: created, error: createError } = await db
    .from('businesses')
    .insert({ organization_id: organizationId, name })
    .select('id')
    .single()

  if (createError || !created?.id) {
    console.error('Unable to ensure businesses row for channel bind', createError)
    // business_id is nullable on channels — allow bind without it
    return null
  }

  // Best-effort link profile → business
  await db
    .from('business_profiles')
    .update({ business_id: created.id })
    .eq('organization_id', organizationId)

  return created.id as string
}

async function audit(
  organizationId: string,
  businessId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  const db = await createClient()
  const { error } = await db.rpc('log_audit_event', {
    p_organization_id: organizationId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_business_id: businessId,
    p_metadata: metadata,
  })
  if (error) {
    console.error('Unable to record channel audit event', error)
  }
}

function describeWriteError(code: string | undefined, message: string): string {
  if (code === '23505') {
    return 'هذا المعرّف مرتبط بشركة أخرى بالفعل. لا يمكن ربط الرقم أو الحساب نفسه لأكثر من شركة.'
  }
  if (code === '23503') {
    return 'مرجع النشاط غير صالح. أكمل إعداد النشاط من /dashboard/setup ثم أعد المحاولة.'
  }
  if (code === '42501') return 'لا تملك صلاحية تعديل قنوات هذه الشركة.'
  return dbActionError({ code, message }, ar.errors.save)
}

export async function saveChannelAction(input: {
  channelType: string
  identifier: string
  publicNumber?: string
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }
    if (spec.type === 'messenger') return { ok: false, error: 'اربط Messenger بتسجيل الدخول إلى Facebook واختيار الصفحة؛ لا يمكن ربطه بمعرّف يدوي.' }
    if (spec.type === 'whatsapp') {
      return {
        ok: false,
        error: 'اربط واتساب عبر Meta ثم أكمل تسجيل رقم الإرسال باستخدام PIN. لا يمكن ربطه يدوياً.',
      }
    }

    const raw = input.identifier.trim()
    if (!raw) return { ok: false, error: 'أدخل ' + spec.bindingLabel + '.' }

    if (spec.type === 'instagram' && !/^\\d+$/.test(raw)) {
      return { ok: false, error: 'أدخل معرّف حساب إنستغرام الرقمي من لوحة Meta.' }
    }

    const identifier =
      spec.type === 'instagram' ? raw : normalizeChannelNumber(raw)
    const publicNumber = spec.publicNumberLabel
      ? normalizeChannelNumber((input.publicNumber ?? '').trim())
      : null
    if (spec.type === 'phone' && !publicNumber) {
      return { ok: false, error: 'أدخل رقم شركتك الحالي.' }
    }

    const db = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const { data: existing, error: readError } = await db
      .from('channels')
      .select('id, is_active')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (readError) throw new Error(readError.message)

    if (!existing) {
      try {
        await assertWithinLimit(db, org.organizationId, 'channels', 1)
      } catch (err) {
        if (err instanceof EntitlementExceededError) {
          return {
            ok: false,
            error: `وصلت لحد القنوات في خطتك (${err.used}/${err.limit}). رقِّ الباقة لإضافة قناة.`,
          }
        }
        throw err
      }
    }

    const binding =
      spec.bindingColumn === 'provider_account_id'
        ? { provider_account_id: identifier, external_identifier: publicNumber }
        : { external_identifier: identifier, provider_account_id: null }

    const patch = {
      ...binding,
      ...(businessId ? { business_id: businessId } : {}),
      is_active: true,
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    }

    const written = existing
      ? await db.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await db
          .from('channels')
          .insert({ organization_id: org.organizationId, channel_type: spec.type, ...patch })
          .select('id')
          .single()

    if (written.error || !written.data) {
      return {
        ok: false,
        error: describeWriteError(written.error?.code, written.error?.message ?? 'تعذّر حفظ القناة.'),
      }
    }

    await audit(org.organizationId, businessId, 'channel.connected', 'channel', written.data.id, {
      channel_type: spec.type,
      provider: spec.provider,
      reconnected: Boolean(existing),
    })

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    return { ok: true, message: 'تم ربط ' + spec.label + '.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ القناة. حاول مرة أخرى.') }
  }
}


export async function connectWhatsAppChannelAction(input: {
  number: string
}): Promise<ChannelActionResult & { status?: 'verified' | 'pending' }> {
  try {
    const org = await requireChannelAdmin()
    const db = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const result = await connectWhatsAppChannel({
      db,
      organizationId: org.organizationId,
      businessId,
      number: input.number,
    })

    if (!result.ok) return { ok: false, error: result.error }

    const { data: cloudChannels } = await db
      .from('channels')
      .select('id, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
    const channel = cloudChannels?.find((row) => row.connection_mode === 'cloud_api') ??
      cloudChannels?.find((row) => !row.connection_mode)

    if (channel?.id) {
      await audit(
        org.organizationId,
        businessId,
        result.outcome.status === 'verified' ? 'channel.connected' : 'channel.connection_pending',
        'channel',
        channel.id,
        {
          channel_type: 'whatsapp',
          reason: result.outcome.reason,
        }
      )
    }

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')

    return {
      ok: true,
      status: result.outcome.status,
      message: result.outcome.message,
    }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر ربط واتساب الآن. حاول مرة أخرى.') }
  }
}

export async function setChannelActiveAction(input: {
  channelType: string
  active: boolean
  connectionMode?: string | null
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const db = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const { data: channelRows, error } = await db
      .from('channels')
      .select('id, is_active, verification_status, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
    if (error) throw new Error(error.message)
    const data = spec.type === 'whatsapp'
      ? channelRows?.find((row) => row.connection_mode === input.connectionMode) ??
        (input.connectionMode === 'cloud_api' ? channelRows?.find((row) => !row.connection_mode) : undefined)
      : channelRows?.[0]
    if (!data) return { ok: false, error: 'قناة طريقة الربط هذه غير مربوطة بعد.' }

    if (input.active && spec.type === 'whatsapp' && data.connection_mode === 'qr_unofficial') {
      const status = await callWhatsAppGateway<{ session: WhatsAppGatewaySession }>('GET', '/sessions/' + data.id + '/status')
      if (status.session.status !== 'connected' || data.verification_status !== 'verified') {
        return { ok: false, error: 'أكمل ربط واتساب عبر QR أو رمز الهاتف أولاً.' }
      }
    } else if (input.active && (spec.type === 'whatsapp' || spec.type === 'messenger') && data.verification_status !== 'verified') {
      return { ok: false, error: 'لا يمكن تفعيل واتساب قبل إكمال التحقق لدى Meta باستخدام PIN.' }
    }

    if (input.active && !data.is_active) {
      try {
        await assertWithinLimit(db, org.organizationId, 'channels', 1)
      } catch (err) {
        if (err instanceof EntitlementExceededError) {
          return {
            ok: false,
            error: `وصلت لحد القنوات في خطتك (${err.used}/${err.limit}).`,
          }
        }
        throw err
      }
    }

    const { error: updateError } = await db
      .from('channels')
      .update({
        is_active: input.active,
        // Preserve successful WhatsApp registration when temporarily disabling
        // the channel. Other providers keep the existing pending/disabled policy.
        verification_status:
          spec.type === 'whatsapp' || spec.type === 'telegram' || spec.type === 'messenger'
            ? data.verification_status
            : input.active
              ? 'pending'
              : 'disabled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    if (updateError) return { ok: false, error: describeWriteError(updateError.code, updateError.message) }

    await audit(
      org.organizationId,
      businessId,
      input.active ? 'channel.enabled' : 'channel.disabled',
      'channel',
      data.id,
      { channel_type: spec.type }
    )

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    return {
      ok: true,
      message: input.active ? 'تم تفعيل ' + spec.label + '.' : 'تم إيقاف ' + spec.label + '.',
    }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث القناة. حاول مرة أخرى.') }
  }
}

export async function testChannelAction(input: {
  channelType: string
  connectionMode?: string | null
}): Promise<{ ok: boolean; error?: string; result?: BindingTestResult }> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const db = await createClient()
    const { data: channelRows, error } = await db
      .from('channels')
      .select(
        'id, channel_type, provider_account_id, external_identifier, verification_status, is_active, business_id, updated_at, connection_mode'
      )
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
    if (error) throw new Error(error.message)
    const data = spec.type === 'whatsapp'
      ? channelRows?.find((row) => row.connection_mode === input.connectionMode) ??
        (input.connectionMode === 'cloud_api' ? channelRows?.find((row) => !row.connection_mode) : undefined)
      : channelRows?.[0]
    if (!data) return { ok: false, error: 'قناة طريقة الربط هذه غير مربوطة بعد.' }

    const result = await verifyChannelBinding(db, data as unknown as ChannelRow)
    if (spec.type === 'whatsapp' && data.connection_mode === 'qr_unofficial') {
      const status = await callWhatsAppGateway<{ session: WhatsAppGatewaySession }>('GET', '/sessions/' + data.id + '/status')
      const connected = status.session.status === 'connected'
      const pairingReady = status.session.status === 'pairing_code' && Boolean(status.session.pairingCode)
      const pairingExpired = status.session.status === 'failed' &&
        (status.session.lastError === 'pairing_code_expired' || status.session.lastError === 'pairing_session_closed')
      const detail = connected
        ? 'الجلسة محفوظة ومتصلة'
        : pairingReady
          ? 'رمز الربط جاهز؛ أدخله الآن في الهاتف من الأجهزة المرتبطة ثم أعد الفحص'
          : pairingExpired
            ? 'انتهت صلاحية رمز الربط؛ أصدر رمزاً جديداً وأدخله مباشرة في الهاتف'
            : 'الجلسة غير متصلة؛ ابدأ جلسة ربط جديدة من بطاقة واتساب'
      result.checks.push({ label: 'جلسة WhatsApp Web', ok: connected, detail })
      result.ok = result.checks.every((check) => check.ok)
    } else if (spec.type === 'whatsapp') {
      const liveChecks = await verifyMetaChannelConnection({
        organizationId: org.organizationId,
        channelId: data.id,
        phoneNumberId: data.provider_account_id,
      })
      result.checks.push(...liveChecks)
      result.ok = result.checks.every((check) => check.ok)
    } else if (spec.type === 'telegram') {
      const admin = createAdminClient()
      const credentials = await loadChannelCredentials(admin, data.id, 'telegram')
      let botOk = false
      let webhookOk = false
      try {
        const bot = await verifyTelegramBot(credentials.bot_token ?? '')
        botOk = bot.is_bot && String(bot.id) === String(data.provider_account_id)
        const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (
          process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ''
        )).replace(/\/$/, '')
        const webhookUrl = `${baseUrl}/api/telegram/webhook/${encodeURIComponent(data.id)}`
        webhookOk = Boolean(credentials.bot_token && await verifyTelegramWebhook(credentials.bot_token, webhookUrl))
      } catch {
        botOk = false
        webhookOk = false
      }
      result.checks.push(
        { label: 'هوية بوت تيليجرام', ok: botOk, detail: botOk ? 'تم التحقق عبر Telegram' : 'تعذّر التحقق من البوت أو الرمز' },
        { label: 'Webhook مسجل', ok: webhookOk, detail: webhookOk ? 'عنوان الاستقبال مطابق' : 'Webhook غير مضبوط أو تغيّر عنوان التطبيق' },
      )
      result.ok = result.checks.every((check) => check.ok)
    } else if (spec.type === 'messenger') {
      const credentials = await loadChannelCredentials(createAdminClient(), data.id, 'meta')
      let pageOk = false, subscribed = false
      try {
        const checked = await verifyMessengerPage(String(data.provider_account_id ?? ''), credentials.page_access_token ?? '')
        pageOk = checked.identityOk
        subscribed = checked.subscriptionOk
      } catch { pageOk = false; subscribed = false }
      result.checks.push(
        { label: 'هوية صفحة Facebook', ok: pageOk, detail: pageOk ? 'تم التحقق من الصفحة' : 'رمز الصفحة غير صالح أو انتهت صلاحيته' },
        { label: 'اشتراك Webhook', ok: subscribed, detail: subscribed ? 'التطبيق مشترك في إشعارات الصفحة' : 'الصفحة غير مشتركة في Webhook' },
      )
      result.ok = result.checks.every((check) => check.ok)
    }

    await audit(org.organizationId, data.business_id, 'channel.tested', 'channel', data.id, {
      channel_type: spec.type,
      passed: result.ok,
    })

    return { ok: result.ok, result }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تنفيذ الفحص. حاول مرة أخرى.') }
  }
}

export async function connectTelegramChannelAction(input: {
  botToken: string
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const token = input.botToken.trim()
    if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return { ok: false, error: 'رمز بوت تيليجرام غير صالح. انسخه كاملاً من BotFather.' }
    }

    const bot = await verifyTelegramBot(token)
    if (!bot.is_bot || !Number.isSafeInteger(bot.id)) {
      return { ok: false, error: 'لم تؤكد Telegram هوية البوت.' }
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || (
      process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ''
    )).replace(/\/$/, '')
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
      return { ok: false, error: 'عنوان التطبيق العام غير مضبوط على الخادم؛ تعذّر إعداد Webhook الآمن.' }
    }

    const db = createAdminClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)
    if (!businessId) return { ok: false, error: 'أكمل إعداد النشاط التجاري قبل ربط تيليجرام.' }
    const { data: existing, error: readError } = await db.from('channels')
      .select('id').eq('organization_id', org.organizationId)
      .eq('channel_type', 'telegram').maybeSingle()
    if (readError) throw new Error('تعذّر قراءة قناة تيليجرام الحالية.')

    if (!existing) {
      const tenantDb = await createClient()
      await assertWithinLimit(tenantDb, org.organizationId, 'channels', 1)
    }

    const patch = {
      business_id: businessId,
      provider_account_id: String(bot.id),
      external_identifier: bot.username ? '@' + bot.username : String(bot.id),
      is_active: false,
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    }
    const written = existing
      ? await db.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await db.from('channels').insert({
          organization_id: org.organizationId, channel_type: 'telegram', ...patch,
        }).select('id').single()
    if (written.error || !written.data?.id) throw new Error('تعذّر حفظ قناة تيليجرام.')

    const channelId = written.data.id as string
    const webhookSecret = randomBytes(32).toString('hex')
    const webhookUrl = `${baseUrl}/api/telegram/webhook/${encodeURIComponent(channelId)}`

    try {
      await saveChannelCredential(db, {
        organizationId: org.organizationId, channelId, provider: 'telegram',
        credentialType: 'bot_token', value: token,
      })
      await saveChannelCredential(db, {
        organizationId: org.organizationId, channelId, provider: 'telegram',
        credentialType: 'webhook_secret', value: webhookSecret,
      })
      const saved = await loadChannelCredentials(db, channelId, 'telegram')
      if (saved.bot_token !== token || saved.webhook_secret !== webhookSecret) {
        throw new Error('تعذّر التحقق من حفظ بيانات تيليجرام المشفّرة.')
      }
      await configureTelegramWebhook({ token, webhookUrl, secretToken: webhookSecret })
      if (!(await verifyTelegramWebhook(token, webhookUrl))) {
        throw new Error('لم تؤكد Telegram تسجيل Webhook للقناة.')
      }
      const activated = await db.from('channels').update({
        is_active: true, verification_status: 'verified', updated_at: new Date().toISOString(),
      }).eq('id', channelId).eq('organization_id', org.organizationId).select('id').single()
      if (activated.error || !activated.data) throw new Error('تم إعداد Webhook لكن تعذّر تفعيل القناة.')
    } catch (error) {
      await db.from('channels').update({
        is_active: false, verification_status: 'failed', updated_at: new Date().toISOString(),
      }).eq('id', channelId).eq('organization_id', org.organizationId)
      // Keep encrypted credentials for an explicit retry; the channel remains inactive and failed.
      throw error
    }

    await audit(org.organizationId, businessId, 'channel.connected', 'channel', channelId, {
      channel_type: 'telegram', provider: 'telegram', bot_id: String(bot.id),
    })
    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    return { ok: true, message: `تم التحقق من البوت @${bot.username ?? bot.id} وإعداد Webhook بنجاح.` }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر ربط بوت تيليجرام.') }
  }
}



export type MessengerPageOption = { id: string; name: string }

export async function createMessengerOAuthStateAction(): Promise<{ok:true;state:string}|{ok:false;error:string}> {
  try {
    const org = await requireChannelAdmin()
    const state = await createEmbeddedSignupOAuthState(org.organizationId)
    return {ok:true,state:state.state}
  } catch(error) {
    return {ok:false,error:actionErrorMessage(error,'تعذّر بدء تسجيل الدخول إلى Facebook.')}
  }
}

export async function beginMessengerConnectionAction(input:{accessToken:string;state:string}):Promise<{ok:boolean;error?:string;pages:MessengerPageOption[]}> {
  try {
    const org=await requireChannelAdmin()
    const oauth=await verifyEmbeddedSignupOAuthState(input.state,org.organizationId)
    if(!oauth)return{ok:false,error:'انتهت جلسة Facebook أو لم تتطابق مع حسابك. أعد بدء الربط.',pages:[]}
    const userToken=input.accessToken?.trim()
    if(!userToken||userToken.length>4096)return{ok:false,error:'لم يصل رمز وصول صالح من Facebook.',pages:[]}
    await ensureMessengerAppWebhook()
    await verifyMessengerPermissions(userToken)
    const pages=await listMessengerPages(userToken)
    if(!pages.length)return{ok:false,error:'لم يعثر Facebook على صفحة تملك صلاحية الرسائل وإدارة الاشتراكات عليها.',pages:[]}
    const db=createAdminClient()
    const businessId=await ensurePrimaryBusinessId(org.organizationId,org.organizationName)
    if(!businessId)return{ok:false,error:'أكمل إعداد النشاط التجاري قبل ربط Messenger.',pages:[]}
    const {data:existing,error:readError}=await db.from('channels').select('id')
      .eq('organization_id',org.organizationId).eq('channel_type','messenger').maybeSingle()
    if(readError)throw new Error('تعذّر قراءة قناة Messenger الحالية.')
    let channelId=existing?.id as string|undefined
    if(!channelId){
      const tenantDb=await createClient()
      await assertWithinLimit(tenantDb,org.organizationId,'channels',1)
      const {data:created,error}=await db.from('channels').insert({
        organization_id:org.organizationId,business_id:businessId,channel_type:'messenger',
        is_active:false,verification_status:'pending'
      }).select('id').single()
      if(error||!created?.id)throw new Error('تعذّر تجهيز قناة Messenger.')
      channelId=created.id as string
    }else{
      await db.from('channels').update({business_id:businessId,is_active:false,verification_status:'pending',
        updated_at:new Date().toISOString()}).eq('id',channelId).eq('organization_id',org.organizationId)
    }
    await saveChannelCredential(db,{organizationId:org.organizationId,channelId,provider:'meta',
      credentialType:'oauth_user_token',value:userToken})
    await audit(org.organizationId,businessId,'channel.messenger_authorization_started','channel',channelId,
      {channel_type:'messenger',eligible_pages:pages.length})
    revalidatePath('/dashboard/channels')
    return{ok:true,pages:pages.map(page=>({id:page.id,name:page.name}))}
  }catch(error){
    const message=error instanceof Error?error.message:''
    if(message.startsWith('messenger_permissions_missing_')){
      return{ok:false,error:'لم يمنح Facebook الصلاحيات المطلوبة: '+message.replace('messenger_permissions_missing_','').replace(/_/g,'، ')+'.',pages:[]}
    }
    if(message==='messenger_webhook_callback_conflict')return{ok:false,error:'عنوان Webhook لصفحات Facebook مستخدم من تكامل آخر؛ لم نغيّر إعداداته.',pages:[]}
    if(message==='messenger_verify_token_missing')return{ok:false,error:'أضف META_MESSENGER_VERIFY_TOKEN أو استخدم WHATSAPP_VERIFY_TOKEN في Railway.',pages:[]}
    return{ok:false,error:actionErrorMessage(error,'تعذّر تفويض صفحات Facebook. تحقق من إعداد Meta والصلاحيات ثم أعد المحاولة.'),pages:[]}
  }
}

export async function completeMessengerConnectionAction(input:{pageId:string}):Promise<ChannelActionResult>{
  try{
    const org=await requireChannelAdmin(),pageId=String(input.pageId??'').trim()
    if(!/^\d{5,30}$/.test(pageId))return{ok:false,error:'معرّف صفحة Facebook غير صالح.'}
    const db=createAdminClient()
    const {data:channel,error}=await db.from('channels').select('id,business_id')
      .eq('organization_id',org.organizationId).eq('channel_type','messenger').maybeSingle()
    if(error||!channel?.id)return{ok:false,error:'ابدأ تفويض Facebook أولاً ثم اختر الصفحة.'}
    const credentials=await loadChannelCredentials(db,channel.id,'meta')
    const userToken=credentials.oauth_user_token
    if(!userToken)return{ok:false,error:'انتهت جلسة اختيار الصفحة. أعد الضغط على ربط صفحة Facebook.'}
    const webhook=await ensureMessengerAppWebhook()
    const page=await getMessengerPage(userToken,pageId)
    await subscribeMessengerPage(page.id,page.access_token)
    const checked=await verifyMessengerPage(page.id,page.access_token)
    if(!checked.identityOk||!checked.subscriptionOk)return{ok:false,error:'لم تؤكد Meta اكتمال اشتراك الصفحة في Webhook. لم يتم تفعيل القناة.'}
    await saveChannelCredential(db,{organizationId:org.organizationId,channelId:channel.id,provider:'meta',
      credentialType:'page_access_token',value:page.access_token})
    await deleteChannelCredential(db,{organizationId:org.organizationId,channelId:channel.id,
      provider:'meta',credentialType:'oauth_user_token'})
    const {error:updateError}=await db.from('channels').update({
      business_id:channel.business_id,provider_account_id:page.id,external_identifier:page.name,
      connection_mode:'native',is_active:true,verification_status:'verified',updated_at:new Date().toISOString()
    }).eq('id',channel.id).eq('organization_id',org.organizationId).eq('channel_type','messenger')
    if(updateError)throw new Error('تم ربط الصفحة لدى Meta لكن تعذّر تفعيل القناة محلياً.')
    await audit(org.organizationId,channel.business_id,'channel.connected','channel',channel.id,
      {channel_type:'messenger',page_id:page.id,page_name:page.name,webhook_url:webhook.callbackUrl})
    revalidatePath('/dashboard/channels');revalidatePath('/dashboard/conversations');revalidatePath('/dashboard/integrations')
    return{ok:true,message:'تم ربط صفحة '+page.name+' وتفعيل استقبال رسائل Messenger.'}
  }catch(error){
    const message=error instanceof Error?error.message:''
    if(message==='messenger_page_access_denied')return{ok:false,error:'حسابك لا يملك صلاحية إدارة رسائل هذه الصفحة. اختر صفحة أخرى أو حدّث صلاحيات الحساب.'}
    if(message==='messenger_webhook_callback_conflict')return{ok:false,error:'عنوان Webhook لصفحات Facebook مستخدم من تكامل آخر؛ لم نغيّر إعداداته.'}
    if(message==='messenger_verify_token_missing')return{ok:false,error:'أضف META_MESSENGER_VERIFY_TOKEN أو استخدم WHATSAPP_VERIFY_TOKEN في Railway.'}
    return{ok:false,error:actionErrorMessage(error,'تعذّر ربط صفحة Facebook. لم نفعّل القناة قبل اكتمال التحقق.')}
  }
}


export type WhatsAppQrConnectionMethod = 'qr' | 'pairing_code'

export async function startWhatsAppQrSessionAction(input: {
  number: string
  method: WhatsAppQrConnectionMethod
}): Promise<{ ok: boolean; error?: string; session?: WhatsAppGatewaySession }> {
  try {
    const org = await requireChannelAdmin()
    const number = normalizeChannelNumber(input.number)
    if (!/^\+[1-9]\d{7,14}$/.test(number)) {
      return { ok: false, error: 'أدخل رقم واتساب بصيغة دولية صحيحة، مثل +967777123456.' }
    }
    if (!['qr', 'pairing_code'].includes(input.method)) {
      return { ok: false, error: 'طريقة الربط غير معروفة.' }
    }

    const admin = createAdminClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)
    if (!businessId) return { ok: false, error: 'أكمل إعداد النشاط التجاري قبل ربط واتساب.' }

    const { data: existing, error: readError } = await admin.from('channels')
      .select('id, connection_mode, is_active')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('connection_mode', 'qr_unofficial')
      .maybeSingle()
    if (readError) throw new Error('تعذّرت قراءة قناة واتساب الحالية.')

    if (!existing || existing.is_active !== true) {
      const tenantDb = await createClient()
      await assertWithinLimit(tenantDb, org.organizationId, 'channels', 1)
    }

    const patch = {
      business_id: businessId,
      provider_account_id: number,
      external_identifier: number,
      connection_mode: 'qr_unofficial',
      is_active: true,
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    }
    const written = existing
      ? await admin.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await admin.from('channels').insert({
          organization_id: org.organizationId,
          channel_type: 'whatsapp',
          ...patch,
        }).select('id').single()
    if (written.error || !written.data?.id) {
      throw new Error('تعذّر تجهيز قناة واتساب لربط QR.')
    }

    const channelId = String(written.data.id)
    const gateway = await callWhatsAppGateway<{ session: WhatsAppGatewaySession }>('POST', '/sessions/start', {
      channelId,
      organizationId: org.organizationId,
      phoneNumber: number,
      method: input.method,
    })

    await audit(org.organizationId, businessId, 'channel.whatsapp_qr_started', 'channel', channelId, {
      channel_type: 'whatsapp',
      connection_mode: 'qr_unofficial',
      method: input.method,
    })
    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/conversations')
    return { ok: true, session: gateway.session }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'pairing_code_request_failed') {
      return { ok: false, error: 'تعذّر توليد رمز الربط حالياً. تحقق من الرقم ثم أعد المحاولة.' }
    }
    return { ok: false, error: actionErrorMessage(error, 'تعذّر بدء ربط واتساب عبر QR.') }
  }
}

export async function getWhatsAppQrSessionStatusAction(): Promise<{
  ok: boolean
  error?: string
  session?: WhatsAppGatewaySession
}> {
  try {
    const org = await requireChannelAdmin()
    const admin = createAdminClient()
    const { data: channel, error } = await admin.from('channels')
      .select('id, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('connection_mode', 'qr_unofficial')
      .maybeSingle()
    if (error) throw new Error('تعذّرت قراءة حالة قناة واتساب.')
    if (!channel || channel.connection_mode !== 'qr_unofficial') {
      return { ok: true, session: { status: 'not_configured' } }
    }
    const result = await callWhatsAppGateway<{ session: WhatsAppGatewaySession }>('GET',
      '/sessions/' + channel.id + '/status')
    return { ok: true, session: result.session }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر قراءة حالة ربط واتساب.') }
  }
}

export async function disconnectWhatsAppQrSessionAction(): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const admin = createAdminClient()
    const { data: channel, error } = await admin.from('channels')
      .select('id, business_id, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('connection_mode', 'qr_unofficial')
      .maybeSingle()
    if (error || !channel?.id || channel.connection_mode !== 'qr_unofficial') {
      return { ok: false, error: 'لا توجد جلسة QR مربوطة بهذا النشاط.' }
    }
    await callWhatsAppGateway('POST', '/sessions/' + channel.id + '/logout', {})
    await audit(org.organizationId, channel.business_id, 'channel.whatsapp_qr_disconnected', 'channel', channel.id, {
      channel_type: 'whatsapp',
      connection_mode: 'qr_unofficial',
    })
    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/conversations')
    return { ok: true, message: 'تم فصل جلسة واتساب.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر فصل جلسة واتساب.') }
  }
}

/**
 * Clears only the QR channel's connection settings. Conversation and contact history
 * remain untouched; the channel row is retained so its WhatsApp connection mode stays
 * unambiguous and can be configured again.
 */
export async function resetWhatsAppQrChannelAction(): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const admin = createAdminClient()
    const { data: channel, error: readError } = await admin.from('channels')
      .select('id, business_id, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('connection_mode', 'qr_unofficial')
      .maybeSingle()
    if (readError) throw new Error('تعذّرت قراءة إعدادات قناة واتساب.')
    if (!channel?.id) return { ok: false, error: 'لا توجد إعدادات QR محفوظة لهذه القناة.' }

    // Do not clear the stored number if the gateway could not safely log out.
    await callWhatsAppGateway('POST', '/sessions/' + channel.id + '/logout', {})
    const { error: updateError } = await admin.from('channels')
      .update({
        provider_account_id: null,
        external_identifier: null,
        is_active: false,
        verification_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channel.id)
      .eq('organization_id', org.organizationId)
    if (updateError) throw updateError

    await audit(org.organizationId, channel.business_id, 'channel.whatsapp_qr_settings_reset', 'channel', channel.id, {
      channel_type: 'whatsapp',
      connection_mode: 'qr_unofficial',
    })
    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/conversations')
    return { ok: true, message: 'تم مسح رقم واتساب وإعدادات الاتصال. سجل المحادثات والعملاء محفوظ.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر مسح إعدادات واتساب. حاول مرة أخرى.') }
  }
}


export async function deleteChannelAction(input: {
  channelType: string
  connectionMode?: string | null
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const db = await createClient()
    const { data: rows, error: readError } = await db.from('channels')
      .select('id, business_id, connection_mode')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
    if (readError) throw new Error('تعذّرت قراءة إعدادات القناة.')
    const channel = spec.type === 'whatsapp'
      ? rows?.find((row) => row.connection_mode === input.connectionMode) ??
        (input.connectionMode === 'cloud_api' ? rows?.find((row) => !row.connection_mode) : undefined)
      : rows?.[0]
    if (!channel?.id) return { ok: false, error: 'إعدادات هذه القناة غير موجودة.' }

    // Close a QR session before removing its local channel record. A stale gateway
    // session must not prevent the owner from removing an incorrect phone number.
    if (spec.type === 'whatsapp' && channel.connection_mode === 'qr_unofficial') {
      try {
        await callWhatsAppGateway('POST', '/sessions/' + channel.id + '/logout', {})
      } catch (error) {
        console.warn('WhatsApp QR logout during channel deletion failed', error)
      }
    }

    await audit(org.organizationId, channel.business_id, 'channel.deleted', 'channel', channel.id, {
      channel_type: spec.type,
      connection_mode: channel.connection_mode ?? null,
    })

    const { error: deleteError } = await db.from('channels')
      .delete()
      .eq('id', channel.id)
      .eq('organization_id', org.organizationId)
    if (deleteError) {
      console.error('Unable to delete channel settings', deleteError)
      return { ok: false, error: describeWriteError(deleteError.code, deleteError.message) }
    }

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    revalidatePath('/dashboard/conversations')
    return { ok: true, message: 'تم حذف إعدادات القناة. يمكنك إدخال الرقم أو بيانات الربط الصحيحة من جديد.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حذف إعدادات القناة.') }
  }
}
