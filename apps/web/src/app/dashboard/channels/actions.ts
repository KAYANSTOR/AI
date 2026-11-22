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
import { saveChannelCredential, loadChannelCredentials } from '@/lib/credentials/service'
import { configureTelegramWebhook, verifyTelegramBot, verifyTelegramWebhook } from '@/lib/providers/telegram'

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

    const { data: channel } = await db
      .from('channels')
      .select('id')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

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
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const db = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const { data, error } = await db
      .from('channels')
      .select('id, is_active, verification_status')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    if (input.active && spec.type === 'whatsapp' && data.verification_status !== 'verified') {
      return {
        ok: false,
        error: 'لا يمكن تفعيل واتساب قبل تسجيل رقم الإرسال لدى Meta باستخدام PIN.',
      }
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
          spec.type === 'whatsapp'
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
}): Promise<{ ok: boolean; error?: string; result?: BindingTestResult }> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const db = await createClient()
    const { data, error } = await db
      .from('channels')
      .select(
        'id, channel_type, provider_account_id, external_identifier, verification_status, is_active, business_id, updated_at'
      )
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    const result = await verifyChannelBinding(db, data as unknown as ChannelRow)
    if (spec.type === 'whatsapp') {
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
\n
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

