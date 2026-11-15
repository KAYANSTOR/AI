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
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/db/admin'
import type { DbClient } from '@/lib/db/client'
import { deleteChannelCredential, loadChannelCredentials, saveChannelCredential } from '@/lib/credentials/service'
import { normalizeChannelNumber } from '@/lib/channels/management'

const GRAPH_VERSION = 'v26.0'

const EMBEDDED_SIGNUP_CALLBACK_PATH = '/api/whatsapp/embedded-signup-callback'
const EMBEDDED_SIGNUP_STATE_TTL_SECONDS = 30 * 60

type EmbeddedSignupOAuthStatePayload = {
  version: 1
  organizationId: string
  issuedAt: number
  nonce: string
  redirectUri: string
}

function oauthStateSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return secret
}

/**
 * Always use Railway's active public hostname at runtime. The same canonical
 * URI is signed into state, sent to Meta, and supplied again during code exchange.
 */
export function getMetaEmbeddedSignupRedirectUri(): string {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  const configuredBase = railwayDomain
    ? (railwayDomain.includes('://') ? railwayDomain : `https://${railwayDomain}`)
    : (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim())

  if (!configuredBase) {
    throw new Error('The public Railway application URL is not configured')
  }

  const base = new URL(configuredBase)
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('Meta OAuth callback must use HTTPS')
  }
  return new URL(EMBEDDED_SIGNUP_CALLBACK_PATH, base.origin).toString()
}

/** Creates a short-lived, signed OAuth state tied to the authenticated organization. */
export function createEmbeddedSignupOAuthState(organizationId: string): {
  state: string
  redirectUri: string
} {
  const redirectUri = getMetaEmbeddedSignupRedirectUri()
  const payload: EmbeddedSignupOAuthStatePayload = {
    version: 1,
    organizationId,
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: randomBytes(24).toString('base64url'),
    redirectUri,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', oauthStateSecret()).update(encoded).digest('base64url')
  return { state: `${encoded}.${signature}`, redirectUri }
}

/** Verifies the callback state and returns only the redirect URI it authorizes. */
export function verifyEmbeddedSignupOAuthState(
  state: string,
  organizationId: string
): { redirectUri: string } | null {
  try {
    if (!state || state.length > 4096) return null
    const [encoded, suppliedSignature, extra] = state.split('.')
    if (!encoded || !suppliedSignature || extra !== undefined) return null

    const expectedSignature = createHmac('sha256', oauthStateSecret()).update(encoded).digest()
    const actualSignature = Buffer.from(suppliedSignature, 'base64url')
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) return null

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<EmbeddedSignupOAuthStatePayload>
    const now = Math.floor(Date.now() / 1000)
    if (
      payload.version !== 1 ||
      payload.organizationId !== organizationId ||
      typeof payload.issuedAt !== 'number' ||
      payload.issuedAt > now + 60 ||
      now - payload.issuedAt > EMBEDDED_SIGNUP_STATE_TTL_SECONDS ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 16 ||
      typeof payload.redirectUri !== 'string'
    ) return null

    const canonicalRedirectUri = getMetaEmbeddedSignupRedirectUri()
    if (payload.redirectUri !== canonicalRedirectUri) return null
    return { redirectUri: canonicalRedirectUri }
  } catch {
    return null
  }
}

export function getMetaGraphBaseUrl(): string {
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

/** Keep Meta Graph requests bounded so mobile signup cannot hang indefinitely. */
function fetchMeta(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  })
}

export type EmbeddedSignupSession = {
  code: string
  phoneNumberId?: string | null
  wabaId?: string | null
  businessPortfolioId?: string | null
  /** Exact OAuth redirect URI used to obtain the authorization code. */
  redirectUri?: string | null
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
async function exchangeCodeForBusinessToken(code: string, redirectUri?: string | null): Promise<string> {
  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const url = new URL(`${getMetaGraphBaseUrl()}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri)

  const response = await fetchMeta(url.toString(), { method: 'GET' })
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
  const response = await fetchMeta(`${getMetaGraphBaseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
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
  const url = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(phoneNumberId)}`)
  url.searchParams.set('fields', 'id,display_phone_number,verified_name')
  const response = await fetchMeta(url.toString(), {
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
  const url = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(wabaId)}/phone_numbers`)
  url.searchParams.set('fields', 'id')
  url.searchParams.set('limit', '100')
  const response = await fetchMeta(url.toString(), {
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

type GraphListResponse<T> = { data?: T[]; error?: { message?: string } }

/** Resolve resources from explicit session data or the token's granted WABA scopes. */
async function resolveSignupResources(
  session: EmbeddedSignupSession,
  businessToken: string
): Promise<{ phoneNumberId: string; wabaId: string }> {
  if (session.phoneNumberId && session.wabaId) {
    return { phoneNumberId: session.phoneNumberId, wabaId: session.wabaId }
  }

  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const appAccessToken = `${appId}|${appSecret}`
  const debugUrl = new URL(`${getMetaGraphBaseUrl()}/debug_token`)
  debugUrl.searchParams.set('input_token', businessToken)
  const debugResponse = await fetchMeta(debugUrl.toString(), {
    headers: { Authorization: `Bearer ${appAccessToken}` },
    cache: 'no-store',
  })
  const debugBody = await debugResponse.json().catch(() => null) as {
    data?: {
      is_valid?: boolean
      granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>
    }
    error?: { message?: string }
  } | null

  if (!debugResponse.ok || debugBody?.data?.is_valid !== true) {
    console.error('EmbeddedSignup: token debug failed', {
      status: debugResponse.status,
      error: debugBody?.error?.message ?? 'Meta did not validate the exchanged token',
    })
    throw new Error('تعذّر التحقق من صلاحية التفويض الذي أعادته Meta. أعد الربط.')
  }

  // For Embedded Signup, Meta's token debugger exposes the assets actually
  // granted to this token. Never treat /me.id as a Business Portfolio ID.
  const grantedWabaIds = (debugBody.data.granular_scopes ?? [])
    .filter((scope) => scope.scope === 'whatsapp_business_management')
    .flatMap((scope) => scope.target_ids ?? [])
    .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)

  // The session's business_id is a real Business Portfolio ID supplied by
  // Meta. Query its owned and client WABAs; never substitute /me.id here.
  const businessWabaIds: string[] = []
  if (session.businessPortfolioId && !session.wabaId) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const businessUrl = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(session.businessPortfolioId)}/${edge}`)
      businessUrl.searchParams.set('fields', 'id')
      businessUrl.searchParams.set('limit', '100')
      const businessResponse = await fetchMeta(businessUrl.toString(), {
        headers: { Authorization: `Bearer ${businessToken}` },
        cache: 'no-store',
      })
      const businessBody = await businessResponse.json().catch(() => null) as GraphListResponse<{ id?: string }> | null
      if (businessResponse.ok) {
        for (const account of businessBody?.data ?? []) {
          if (account.id && !businessWabaIds.includes(account.id)) businessWabaIds.push(account.id)
        }
      }
    }
  }

  const wabaIds = session.wabaId
    ? [session.wabaId]
    : [...new Set([...grantedWabaIds, ...businessWabaIds])]
  if (!wabaIds.length) {
    throw new Error('لم تُرجع Meta حساب WhatsApp ضمن صلاحيات التفويض. أعد الربط وتأكد من اختيار حساب الأعمال.')
  }

  for (const wabaId of wabaIds) {
    const url = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(wabaId)}/phone_numbers`)
    url.searchParams.set('fields', 'id')
    url.searchParams.set('limit', '100')
    const response = await fetchMeta(url.toString(), {
      headers: { Authorization: `Bearer ${businessToken}` },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => null) as GraphListResponse<{ id?: string }> | null
    if (!response.ok) {
      console.error('EmbeddedSignup: phone discovery failed', {
        status: response.status,
        error: (body as { error?: { message?: string } } | null)?.error?.message ?? 'Meta denied access to WABA phone numbers',
      })
      continue
    }

    const phones = (body?.data ?? []).map((phone) => phone.id).filter((id): id is string => Boolean(id))
    const phoneNumberId = session.phoneNumberId
      ? phones.find((id) => id === session.phoneNumberId)
      : phones.length === 1 ? phones[0] : undefined

    // Do not silently choose a phone when a WABA contains multiple numbers.
    if (phoneNumberId) return { phoneNumberId, wabaId }
  }

  throw new Error('لم تتمكن Meta من تحديد رقم الهاتف بشكل مؤكد. أعد الربط من نافذة Meta.')
}

export async function ensureBusinessId(
  admin: DbClient,
  organizationId: string,
  suppliedBusinessId: string | null,
  organizationName?: string | null
): Promise<string> {
  const { data: profile, error: profileError } = await admin.from('business_profiles')
    .select('business_id, business_type_id, timezone')
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

  // business_profiles has no display_name/name columns. The canonical
  // business name belongs to organizations; never query columns absent from
  // the deployed schema.
  let name = organizationName?.trim() ?? ''
  if (!name) {
    const { data: organization, error: organizationError } = await admin.from('organizations')
      .select('name').eq('id', organizationId).maybeSingle()
    if (organizationError) throw new Error('تعذّر قراءة اسم النشاط من بيانات المؤسسة.')
    name = (organization?.name as string | null)?.trim() ?? ''
  }
  if (!name) throw new Error('اسم المؤسسة غير متوفر لإنشاء سجل النشاط.')
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
  const { code } = input.session
  if (!code) {
    return { ok: false, error: 'بيانات الربط من Meta غير مكتملة. حاول مرة أخرى.' }
  }

  try {
    const businessToken = await exchangeCodeForBusinessToken(code, input.session.redirectUri)
    const { phoneNumberId, wabaId } = await resolveSignupResources(input.session, businessToken)
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
    // Persist each encrypted field before activation. If any write fails,
    // remove the partial set and leave the channel pending/inactive.
    try {
      await saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'access_token', value: businessToken,
      })
      await saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'business_account_id', value: wabaId,
      })
      await saveChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
        credentialType: 'phone_number_id', value: phoneNumberId,
      })
    } catch (credentialWriteError) {
      const cleanup = await deleteChannelCredential(admin, {
        organizationId: input.organizationId, channelId, provider: 'meta',
      }).catch((cleanupError) => {
        console.error('EmbeddedSignup: partial credential cleanup failed', cleanupError)
      })
      void cleanup
      throw credentialWriteError
    }

    const persistedCredentials = await loadChannelCredentials(admin, channelId, 'meta')
    if (
      persistedCredentials.access_token !== businessToken ||
      persistedCredentials.business_account_id !== wabaId ||
      persistedCredentials.phone_number_id !== phoneNumberId
    ) {
      throw new Error('تعذّر التحقق من حفظ بيانات اعتماد Meta المشفّرة.')
    }

    // Meta Embedded Signup grants access to the WABA, but does not itself
    // register the selected phone number for Cloud API messaging. Keep the
    // channel inactive until the owner submits the number's 6-digit 2-step PIN
    // to POST /{phone-number-id}/register.

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
      message: 'تم تفويض Meta وحفظ بيانات القناة. بقي تسجيل رقم الإرسال برمز PIN المكوّن من 6 أرقام لإكمال التفعيل.',
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
