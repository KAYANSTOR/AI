import { createAdminClient } from '@/lib/db/admin'
import { loadChannelCredentials } from '@/lib/credentials/service'
import { getMetaGraphBaseUrl } from '@/lib/channels/embedded-signup'

type MetaCheck = { label: string; ok: boolean; detail?: string }

async function graphGet<T>(path: string, token: string): Promise<{ ok: boolean; body: T | null; status: number }> {
  const response = await fetch(`${getMetaGraphBaseUrl()}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as T | null
  return { ok: response.ok, body, status: response.status }
}

/**
 * Live Meta verification. Database flags alone are not proof that the app is
 * subscribed to the customer's WABA or that the stored token can access the phone.
 */
export async function verifyMetaChannelConnection(input: {
  organizationId: string
  channelId: string
  phoneNumberId: string | null
}): Promise<MetaCheck[]> {
  const checks: MetaCheck[] = []
  const admin = createAdminClient()

  let credentials: Record<string, string>
  try {
    credentials = await loadChannelCredentials(admin, input.channelId)
  } catch {
    return [
      { label: 'بيانات اعتماد Meta محفوظة ومقروءة', ok: false, detail: 'تعذّر فك تشفير بيانات Meta؛ تحقق من مفتاح التشفير.' },
    ]
  }

  const token = credentials.access_token
  const wabaId = credentials.business_account_id
  const credentialSetOk = Boolean(token && wabaId && credentials.phone_number_id)
  checks.push({
    label: 'بيانات اعتماد Meta محفوظة ومقروءة',
    ok: credentialSetOk,
    detail: credentialSetOk ? 'تم تحميل الرمز ومعرّفات الحساب من التخزين المشفّر' : 'الرمز أو معرّف حساب الأعمال أو معرّف الهاتف مفقود',
  })
  if (!credentialSetOk || !token || !wabaId || !credentials.phone_number_id) return checks

  const phoneNumberId = input.phoneNumberId
  const storedPhoneIdMatches = Boolean(phoneNumberId && credentials.phone_number_id === phoneNumberId)
  checks.push({
    label: 'معرّف الهاتف مطابق',
    ok: storedPhoneIdMatches,
    detail: storedPhoneIdMatches ? phoneNumberId! : 'معرّف القناة لا يطابق معرّف الهاتف المشفّر',
  })
  if (!storedPhoneIdMatches || !phoneNumberId) return checks

  const phone = await graphGet<{ id?: string; error?: { message?: string } }>(
    `${encodeURIComponent(phoneNumberId)}?fields=id`,
    token
  )
  checks.push({
    label: 'Meta تؤكد صلاحية الوصول إلى رقم الهاتف',
    ok: phone.ok && phone.body?.id === phoneNumberId,
    detail: phone.ok && phone.body?.id === phoneNumberId ? 'الرقم قابل للقراءة من Meta' : `تعذّر الوصول إلى الرقم (HTTP ${phone.status})`,
  })

  const waba = await graphGet<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=100`,
    token
  )
  const belongs = waba.ok && Boolean(waba.body?.data?.some((entry) => entry.id === phoneNumberId))
  checks.push({
    label: 'رقم الهاتف تابع لحساب WhatsApp Business المحدد',
    ok: belongs,
    detail: belongs ? 'معرّف الهاتف موجود ضمن أرقام حساب الأعمال' : `لم يظهر الرقم ضمن حساب الأعمال (HTTP ${waba.status})`,
  })

  const subscriptions = await graphGet<{
    data?: Array<{ whatsapp_business_api_data?: { id?: string } }>
    error?: { message?: string }
  }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, token)
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
  const subscribed = subscriptions.ok && Boolean(appId) &&
    Boolean(subscriptions.body?.data?.some((entry) => entry.whatsapp_business_api_data?.id === appId))
  checks.push({
    label: 'تطبيق KAYAN AI مشترك فعلياً في إشعارات حساب Meta',
    ok: subscribed,
    detail: subscribed ? 'معرّف التطبيق موجود في اشتراكات WABA' :
      !appId ? 'معرّف تطبيق Meta غير مضبوط على الخادم' :
      `Meta لا تعرض تطبيق KAYAN AI ضمن اشتراكات هذا الحساب (HTTP ${subscriptions.status})`,
  })

  const { data: channel } = await admin.from('channels').select('business_id')
    .eq('id', input.channelId).eq('organization_id', input.organizationId).maybeSingle()
  const businessId = channel?.business_id as string | null
  if (!businessId) {
    checks.push({ label: 'القناة مرتبطة بنشاط الشركة', ok: false, detail: 'مرجع النشاط غير محفوظ في القناة' })
  } else {
    const { data: business } = await admin.from('businesses').select('id')
      .eq('id', businessId).eq('organization_id', input.organizationId).maybeSingle()
    const { data: profile } = await admin.from('business_profiles').select('business_id')
      .eq('organization_id', input.organizationId).maybeSingle()
    const linked = business?.id === businessId && profile?.business_id === businessId
    checks.push({
      label: 'القناة وملف النشاط مرتبطان بالنشاط نفسه',
      ok: linked,
      detail: linked ? 'مرجع النشاط متطابق' : 'يوجد نقص أو اختلاف في مرجع النشاط',
    })
  }

  return checks
}
