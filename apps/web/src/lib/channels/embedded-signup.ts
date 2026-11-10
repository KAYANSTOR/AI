/**
 * Meta Embedded Signup — server side (Tech Provider path).
 *
 * After the customer completes the Facebook popup:
 *   1. Exchange the returned code for a business token.
 *   2. Subscribe our app to the customer's WABA webhooks.
 *   3. Confirm Meta can read the selected phone number and subscribe the WABA.
 *   4. Persist encrypted credentials, then activate the tenant-bound channel.
 *
 * All Graph calls are server-to-server. Nothing secret reaches the browser.
 */
import { createAdminClient } from '@/lib/db/admin'
import { loadChannelCredentials, saveChannelCredential } from '@/lib/credentials/service'
import { normalizeChannelNumber } from '@/lib/channels/management'

const GRAPH_VERSION = 'v26.0'

function graphBase(): string {
  const configured = process.env.META_GRAPH_BASE_URL?.trim()
  if (configured) {
    const normalized = configured.replace(/\/+$/, '')
    // Keep custom Graph hosts, but do not let a stale version in the configured
    // production URL silently override the version selected by this integration.
    if (/^https:\/\/graph\.facebook\.com(?:\/v\d+\.\d+)?$/i.test(normalized)) {
      return normalized.replace(/\/v\d+\.\d+$/i, '') + `/${GRAPH_VERSION}`
    }
    return normalized
  }
  return `https://graph.facebook.com/${GRAPH_VERSION}`
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export type EmbeddedSignupSession = {
  code: string
  phoneNumberId: string
  wabaId: string
  businessPortfolioId?: string | null
  /** Optional display number if the client already knows it. */
  displayPhoneNumber?: string | null
}

export type EmbeddedSignupResult =
  | {
      ok: true
      phoneNumberId: string
      wabaId: string
      businessId: string
      displayNumber: string | null
      message: string
    }
  | { ok: false; error: string }

/** Exchange the short-lived code from FB.login for a business integration token. */
async function exchangeCodeForBusinessToken(code: string): Promise<string> {
  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const url = new URL(`${graphBase()}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)

  const response = await fetch(url.toString(), { method: 'GET' })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('EmbeddedSignup: code exchange failed', response.status, body)
    throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
  }

  // Meta may return either a plain token string or a JSON object.
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return json.access_token
  }

  const text = (await response.text()).trim()
  if (!text) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
  // Some responses are form-encoded: access_token=...
  if (text.startsWith('{')) {
    const json = JSON.parse(text) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return json.access_token
  }
  if (text.includes('access_token=')) {
    const params = new URLSearchParams(text)
    const token = params.get('access_token')
    if (!token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return token
  }
  return text
}

async function subscribeAppToWaba(wabaId: string, businessToken: string): Promise<void> {
  const response = await fetch(`${graphBase()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  const body = await response.json().catch(() => null) as { success?: boolean; error?: { message?: string } } | null
  if (!response.ok || body?.success !== true) {
    console.error('EmbeddedSignup: subscribe_apps failed', {
      status: response.status,
      error: body?.error?.message ?? 'Meta did not confirm subscription',
    })
    throw new Error('لم تؤكد Meta تفعيل استقبال إشعارات واتساب. تحقق من صلاحيات التطبيق ثم أعد الربط.')
  }
}

async function fetchVerifiedPhoneNumber(
  phoneNumberId: string,
  businessToken: string
): Promise<string | null> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(phoneNumberId)}`)
  url.searchParams.set('fields', 'id,display_phone_number,verified_name')
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  const body = await response.json().catch(() => null) as {
    id?: string
    display_phone_number?: string
    error?: { message?: string }
  } | null
  if (!response.ok || body?.id !== phoneNumberId) {
    console.error('EmbeddedSignup: phone verification failed', {
      status: response.status,
      error: body?.error?.message ?? 'Phone number was not confirmed by Meta',
    })
    throw new Error('لم تتمكن Meta من التحقق من رقم واتساب المرتبط. أعد الربط وتأكد من اختيار الرقم الصحيح.')
  }
  return body.display_phone_number ?? null
}

async function verifyPhoneBelongsToWaba(
  wabaId: string,
  phoneNumberId: string,
  businessToken: string
): Promise<void> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(wabaId)}/phone_numbers`)
  url.searchParams.set('fields', 'id')
  url.searchParams.set('limit', '100')
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  const body = await response.json().catch(() => null) as {
    data?: Array<{ id?: string }>
    error?: { message?: string }
  } | null
  if (!response.ok || !body?.data?.some((phone) => phone.id === phoneNumberId)) {
    console.error('EmbeddedSignup: phone/WABA association failed', {
      status: response.status,
      error: body?.error?.message ?? 'Phone number is not listed under the selected WABA',
    })
    throw new Error('رقم واتساب الذي أعادته Meta لا يتبع حساب الأعمال المحدد. أعد اختيار الحساب والرقم.')
  }
}

async function ensureBusinessId(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  suppliedBusinessId: string | null,
  organizationName?: string | null
): Promise<string> {
  const { data: profile, error: profileError } = await admin.from('business_profiles')
    .select('business_id, display_name, name, business_type_id, timezone')
    .eq('organization_id', organizationId).maybeSingle()
  if (profileError) throw new Error('تعذّر قراءة ملف النشاط.')

  const linkProfile = async (businessId: string) => {
    const result = profile
      ? await admin.from('business_profiles')
          .update({ business_id: businessId, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId)
      : await admin.from('business_profiles')
          .insert({ organization_id: organizationId, business_id: businessId })
    if (result.error) throw new Error('تعذّر ربط ملف النشاط بسجل النشاط.')
  }

  if (suppliedBusinessId) {
    const { data, error } = await admin.from('businesses').select('id')
      .eq('id', suppliedBusinessId).eq('organization_id', organizationId).maybeSingle()
    if (error) throw new Error('تعذّر التحقق من مرجع النشاط.')
    if (data?.id) {
      await linkProfile(data.id as string)
      return data.id as string
    }
  }

  if (profile?.business_id) {
    const { data: linked, error: linkedError } = await admin.from('businesses').select('id')
      .eq('id', profile.business_id).eq('organization_id', organizationId).maybeSingle()
    if (linkedError) throw new Error('تعذّر التحقق من النشاط المرتبط.')
    if (linked?.id) {
      await linkProfile(linked.id as string)
      return linked.id as string
    }
  }

  const { data: existing, error: existingError } = await admin.from('businesses').select('id')
    .eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (existingError) throw new Error('تعذّر قراءة بيانات النشاط.')
  if (existing?.id) {
    await linkProfile(existing.id as string)
    return existing.id as string
  }

  let name = (profile?.display_name as string | null) || (profile?.name as string | null) || organizationName?.trim() || ''
  if (!name) {
    const { data: organization } = await admin.from('organizations').select('name')
      .eq('id', organizationId).maybeSingle()
    name = (organization?.name as string | null) || 'Business'
  }
  const baseSlug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
  const slug = baseSlug || 'business'

  const created = await admin.from('businesses').insert({
    organization_id: organizationId,
    name,
    slug: `${slug}-${organizationId.slice(0, 8)}`,
    business_type_id: profile?.business_type_id ?? null,
    timezone: profile?.timezone ?? 'UTC',
  }).select('id').single()
  if (created.error || !created.data?.id) {
    console.error('EmbeddedSignup: unable to create business record', created.error)
    throw new Error('تعذّر إنشاء سجل النشاط اللازم لتوجيه رسائل واتساب.')
  }

  const businessId = created.data.id as string
  await linkProfile(businessId)
  return businessId
}

/**
 * Completes onboarding after Embedded Signup returns session data + code.
 * Idempotent for the same organization + phone_number_id.
 */
export async function completeEmbeddedSignup(input: {
  organizationId: string
  businessId: string | null
  organizationName?: string | null
  session: EmbeddedSignupSession
}): Promise<EmbeddedSignupResult> {
  const { code, phoneNumberId, wabaId } = input.session
  if (!code || !phoneNumberId || !wabaId) {
    return { ok: false, error: 'بيانات الربط من Meta غير مكتملة. حاول مرة أخرى.' }
  }

  try {
    const businessToken = await exchangeCodeForBusinessToken(code)
    const admin = createAdminClient()
    const businessId = await ensureBusinessId(admin, input.organizationId, input.businessId, input.organizationName)

    // Verify the Meta phone and webhook subscription before making the channel routable.
    await verifyPhoneBelongsToWaba(wabaId, phoneNumberId, businessToken)
    const displayFromApi = await fetchVerifiedPhoneNumber(phoneNumberId, businessToken)
    await subscribeAppToWaba(wabaId, businessToken)
    const displayNumber = displayFromApi ??
      (input.session.displayPhoneNumber ? normalizeChannelNumber(input.session.displayPhoneNumber) : null)

    const { data: existing, error: readError } = await admin.from('channels').select('id')
      .eq('organization_id', input.organizationId).eq('channel_type', 'whatsapp').maybeSingle()
    if (readError) throw new Error('تعذّر قراءة قناة واتساب الحالية.')

    // Pending/inactive until every required encrypted credential is safely stored.
    const patch = {
      business_id: businessId,
      provider_account_id: phoneNumberId,
      external_identifier: displayNumber,
      verification_status: 'pending',
      is_active: false,
      updated_at: new Date().toISOString(),
    }
    const written = existing
      ? await admin.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await admin.from('channels').insert({
          organization_id: input.organizationId,
          channel_type: 'whatsapp',
          ...patch,
        }).select('id').single()
    if (written.error || !written.data) {
      console.error('EmbeddedSignup: failed to save channel', written.error)
      throw new Error('تعذّر حفظ قناة واتساب. حاول مرة أخرى.')
    }

    const channelId = written.data.id as string
    await Promise.all([
      saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'access_token', value: businessToken,
      }),
      saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'business_account_id', value: wabaId,
      }),
      saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'phone_number_id', value: phoneNumberId,
      }),
    ])

    const persistedCredentials = await loadChannelCredentials(admin, channelId)
    if (
      persistedCredentials.access_token !== businessToken ||
      persistedCredentials.business_account_id !== wabaId ||
      persistedCredentials.phone_number_id !== phoneNumberId
    ) {
      throw new Error('تعذّر التحقق من حفظ بيانات اعتماد Meta المشفّرة.')
    }

    const { error: activateError } = await admin.from('channels').update({
      verification_status: 'verified',
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', channelId).eq('organization_id', input.organizationId)
    if (activateError) throw new Error('تم حفظ بيانات الربط لكن تعذّر تفعيل القناة.')

    if (displayNumber) {
      const { error: profileUpdateError } = await admin.from('business_profiles')
        .update({ public_phone_number: displayNumber, updated_at: new Date().toISOString() })
        .eq('organization_id', input.organizationId)
      if (profileUpdateError) console.warn('EmbeddedSignup: could not sync public phone number', profileUpdateError.message)
    }

    return {
      ok: true,
      phoneNumberId,
      wabaId,
      businessId,
      displayNumber,
      message: 'تم التحقق من رقم واتساب وحفظ بيانات Meta وربط القناة بالنشاط بنجاح.',
    }
  } catch (error) {
    console.error('EmbeddedSignup: complete failed', error)
    const message =
      error instanceof Error && /^(تعذّر|لم تتمكن|لم تؤكد)/.test(error.message)
        ? error.message
        : 'تعذّر إتمام ربط واتساب. لم يتم تفعيل القناة لأن التحقق أو حفظ بيانات الربط لم يكتمل.'
    return { ok: false, error: message }
  }
}

/** True when the public env needed to launch the popup is present. */
export function isEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
