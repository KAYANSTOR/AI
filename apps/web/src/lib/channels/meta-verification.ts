import { createAdminClient } from '@/lib/db/admin'
import { loadChannelCredentials } from '@/lib/credentials/service'
import { getMetaGraphBaseUrl } from '@/lib/channels/embedded-signup'

type MetaCheck = { label: string; ok: boolean; detail?: string }

async function graphGet<T>(path: string, token: string): Promise<{ ok: boolean; body: T | null; status: number }> {
  try {
    const response = await fetch(`${getMetaGraphBaseUrl()}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => null) as T | null
    return { ok: response.ok, body, status: response.status }
  } catch {
    return { ok: false, body: null, status: 0 }
  }
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
    credentials = await loadChannelCredentials(admin, input.channelId, 'meta')
  } catch {
    return [
      { label: 'بيانات اعتماد Meta محفوظة ومقروءة', ok: false, detail: 'تعذّر فك تشفير بيانات Meta؛ تحقق من مفتاح التشفير.' },
    ]
  }

  // Older integrations may have stored the WABA identifier under Meta's
  // original field name. Accept it as a read-only compatibility alias.
  const token = credentials.access_token
  const wabaId = credentials.business_account_id || credentials.waba_id
  const phoneCredential = credentials.phone_number_id
  const requiredCredentials = [
    ['access_token', token],
    ['business_account_id', wabaId],
    ['phone_number_id', phoneCredential],
  ] as const
  const missingCredentials = requiredCredentials.filter(([, value]) => !value).map(([name]) => name)
  let credentialDetail = 'تم تحميل بيانات اعتماد Meta المطلوبة من التخزين المشفّر'
  if (missingCredentials.length) {
    const { data: metadata, error: metadataError } = await admin
      .from('provider_credentials')
      .select('credential_type, status')
      .eq('channel_id', input.channelId)
      .eq('provider', 'meta')
    if (metadataError) {
      credentialDetail = `تعذّر تحديد حالة الحقول الناقصة (${missingCredentials.join('، ')})`
    } else {
      const rows = metadata ?? []
      const disabled = missingCredentials.filter((name) =>
        rows.some((row) => row.credential_type === name && row.status !== 'active')
      )
      const absent = missingCredentials.filter((name) => !rows.some((row) => row.credential_type === name))
      credentialDetail = [
        absent.length ? `حقول غير محفوظة: ${absent.join('، ')}` : '',
        disabled.length ? `حقول غير مفعّلة: ${disabled.join('، ')}` : '',
      ].filter(Boolean).join('؛ ') || `تعذّر تحميل الحقول: ${missingCredentials.join('، ')}`
    }
  }
  const credentialSetOk = missingCredentials.length === 0
  checks.push({
    label: 'بيانات اعتماد Meta محفوظة ومقروءة',
    ok: credentialSetOk,
    detail: credentialDetail,
  })
  if (!credentialSetOk || !token || !wabaId || !phoneCredential) return checks

  const phoneNumberId = input.phoneNumberId
  const storedPhoneIdMatches = Boolean(phoneNumberId && phoneCredential === phoneNumberId)
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
