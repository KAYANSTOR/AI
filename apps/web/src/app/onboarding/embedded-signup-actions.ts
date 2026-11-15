'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { createAdminClient } from '@/lib/db/admin'
import { loadChannelCredentials } from '@/lib/credentials/service'
import { getMetaGraphBaseUrl } from '@/lib/channels/embedded-signup'
import { getCurrentOrg } from '@/lib/org'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import {
  completeEmbeddedSignup,
  createEmbeddedSignupOAuthState,
  verifyEmbeddedSignupOAuthState,
} from '@/lib/channels/embedded-signup'

export type OnboardingResult = { ok: boolean; error?: string; message?: string }

async function requireOnboardingAdmin() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('إعداد النشاط متاح لمالك النشاط أو المسؤول فقط.')
  }
  return org
}

async function auditSetup(
  organizationId: string,
  businessId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    const db = await createClient()
    const { error } = await db.rpc('log_audit_event', {
      p_organization_id: organizationId,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_business_id: businessId,
      p_metadata: metadata,
    })
    if (error) console.error('Unable to record onboarding audit event', error)
  } catch (error) {
    console.error('Unable to record onboarding audit event', error)
  }
}

/**
 * Completes Meta Embedded Signup after the customer finishes the Facebook popup.
 */
/**
 * Issues a short-lived OAuth state for the authenticated organization.
 * The client receives no signing key; the callback validates the signature on the server.
 */
export async function createWhatsAppEmbeddedSignupOAuthStateAction(): Promise<
  { ok: true; state: string; redirectUri: string } | { ok: false; error: string }
> {
  try {
    const org = await requireOnboardingAdmin()
    const result = createEmbeddedSignupOAuthState(org.organizationId)
    return { ok: true, ...result }
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'تعذّر بدء الربط مع Meta. حدّث الصفحة وحاول مرة أخرى.'),
    }
  }
}

export async function completeWhatsAppEmbeddedSignupAction(input: {
  code: string
  state: string
  phoneNumberId?: string | null
  wabaId?: string | null
  businessPortfolioId?: string | null
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const oauthState = verifyEmbeddedSignupOAuthState(input.state, org.organizationId)
    if (!oauthState) {
      return { ok: false, error: 'انتهت صلاحية جلسة Meta أو لم تتطابق مع الحساب الحالي. أعد بدء الربط.' }
    }

    const db = await createClient()

    const { data: profile } = await db
      .from('business_profiles')
      .select('business_id')
      .eq('organization_id', org.organizationId)
      .maybeSingle()

    const result = await completeEmbeddedSignup({
      organizationId: org.organizationId,
      businessId: (profile?.business_id as string | null) ?? null,
      organizationName: org.organizationName,
      session: {
        code: input.code,
        phoneNumberId: input.phoneNumberId ?? null,
        wabaId: input.wabaId ?? null,
        businessPortfolioId: input.businessPortfolioId ?? null,
        redirectUri: oauthState.redirectUri,
      },
    })

    if (!result.ok) return { ok: false, error: result.error }

    await auditSetup(
      org.organizationId,
      result.businessId,
      'channel.whatsapp_embedded_signup',
      'channel',
      null,
      {
        phone_number_id: result.phoneNumberId,
        waba_id: result.wabaId,
        display_number: result.displayNumber,
      }
    )

    revalidatePath('/onboarding')
    revalidatePath('/dashboard/channels')
    return { ok: true, message: result.message }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إتمام ربط واتساب عبر Meta.') }
  }
}


/**
 * Completes the separate WhatsApp Cloud API phone registration step.
 * The six-digit PIN is sent directly to Meta and is never stored or logged.
 */
export async function registerWhatsAppCloudApiNumberAction(input: {
  pin: string
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const pin = String(input?.pin ?? '').trim()
    if (!/^\\d{6}$/.test(pin)) {
      return { ok: false, error: 'أدخل رمز التحقق بخطوتين المكوّن من 6 أرقام.' }
    }

    const admin = createAdminClient()
    const { data: channel, error: channelError } = await admin
      .from('channels')
      .select('id, provider_account_id, business_id, channel_type')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

    if (channelError) {
      console.error('WhatsApp registration: unable to load owned channel', channelError)
      return { ok: false, error: 'تعذّر قراءة قناة واتساب الحالية.' }
    }
    if (!channel?.id || !channel.provider_account_id) {
      return { ok: false, error: 'لم يتم العثور على رقم إرسال مرتبط بالقناة. أعد ربط واتساب عبر Meta.' }
    }

    const phoneNumberId = String(channel.provider_account_id)
    const credentials = await loadChannelCredentials(admin, channel.id, 'meta')
    const accessToken = credentials.access_token?.trim()
    const storedPhoneNumberId = credentials.phone_number_id?.trim()
    if (!accessToken || !storedPhoneNumberId) {
      return { ok: false, error: 'بيانات ربط Meta غير مكتملة. أعد ربط واتساب عبر Meta.' }
    }
    if (storedPhoneNumberId !== phoneNumberId) {
      console.error('WhatsApp registration: channel/credential phone ID mismatch', {
        channelId: channel.id,
        channelPhoneNumberId: phoneNumberId,
        credentialPhoneNumberId: storedPhoneNumberId,
      })
      return { ok: false, error: 'رقم الإرسال المحفوظ لا يطابق بيانات تفويض Meta. أعد ربط القناة قبل التسجيل.' }
    }

    const response = await fetch(
      `${getMetaGraphBaseUrl()}/${encodeURIComponent(phoneNumberId)}/register`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      }
    )
    const body = await response.json().catch(() => null) as {
      success?: boolean
      error?: {
        code?: number
        message?: string
        error_data?: { details?: string }
      }
    } | null

    if (!response.ok || body?.success !== true) {
      const code = body?.error?.code ?? null
      console.error('WhatsApp registration: Meta rejected phone registration', {
        httpStatus: response.status,
        metaCode: code,
        details: body?.error?.error_data?.details ?? null,
      })

      if (code === 133005) {
        return { ok: false, error: 'رمز PIN غير صحيح. أدخل رمز التحقق بخطوتين الحالي لهذا الرقم.' }
      }
      if (code === 133006) {
        return { ok: false, error: 'يجب إكمال التحقق من ملكية رقم الهاتف لدى Meta قبل التسجيل.' }
      }
      if (code === 133008 || code === 133009) {
        return { ok: false, error: 'محاولات إدخال PIN كثيرة أو متقاربة. انتظر المدة التي تحددها Meta ثم حاول مرة واحدة.' }
      }
      if (code === 133015) {
        return { ok: false, error: 'Meta ما زالت تُكمل إزالة تسجيل سابق لهذا الرقم. انتظر 5 دقائق ثم أعد المحاولة.' }
      }
      return {
        ok: false,
        error: code
          ? `رفضت Meta تسجيل رقم الإرسال (رمز ${code}). تحقق من حالة الرقم وصلاحيات حساب الأعمال ثم أعد المحاولة.`
          : 'تعذّر تأكيد تسجيل رقم الإرسال لدى Meta. تحقق من الاتصال ثم حاول مرة أخرى.',
      }
    }

    const { data: updated, error: updateError } = await admin
      .from('channels')
      .update({
        verification_status: 'verified',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', channel.id)
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .select('id')
      .single()

    if (updateError || !updated) {
      console.error('WhatsApp registration: Meta succeeded but channel activation failed', {
        channelId: channel.id,
        error: updateError,
      })
      return {
        ok: false,
        error: 'سجّلت Meta الرقم بنجاح، لكن تعذّر تحديث حالة القناة في Kayan AI. أعد الضغط على التسجيل لإكمال التفعيل.',
      }
    }

    await auditSetup(
      org.organizationId,
      (channel.business_id as string | null) ?? null,
      'channel.whatsapp_phone_registered',
      'channel',
      channel.id,
      { phone_number_id: phoneNumberId }
    )
    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/conversations')
    revalidatePath('/onboarding')
    return {
      ok: true,
      message: 'تم تسجيل رقم الإرسال لدى WhatsApp Cloud API وتفعيل القناة بنجاح.',
    }
  } catch (error) {
    console.error('WhatsApp registration action failed', error)
    return {
      ok: false,
      error: actionErrorMessage(error, 'تعذّر تسجيل رقم واتساب لدى Meta. تحقق من إعدادات القناة ثم حاول مرة أخرى.'),
    }
  }
}
