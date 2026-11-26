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
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/db/admin'
import type { DbClient } from '@/lib/db/client'
import { normalizeChannelNumber } from '@/lib/channels/management'
import { resolveWhatsAppConnectionMode } from '@/lib/channels/whatsapp-connection-mode'
import { bindMetaChannel } from '@/lib/channels/meta-binding'
import { isMetaSocialChannel, MetaLinkError, metaLinkStatusFromGraph, type MetaLinkStatus, type MetaSocialChannel } from '@/lib/channels/meta-connection'
import { z } from 'zod'

const META_GRAPH_VERSION = 'v26.0'

const EMBEDDED_SIGNUP_CALLBACK_PATH = '/api/whatsapp/embedded-signup-callback'
const META_SOCIAL_CALLBACK_PATH = '/api/meta/connect/callback'
const EMBEDDED_SIGNUP_STATE_TTL_SECONDS = 30 * 60

type MetaSocialTarget = { channel: MetaSocialChannel; pageId: string | null }

type EmbeddedSignupOAuthStatePayload = {
  version: 1
  organizationId: string
  issuedAt: number
  nonce: string
  redirectUri: string
  social?: MetaSocialTarget
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
export function getMetaEmbeddedSignupRedirectUri(social = false): string {
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
  return new URL(social ? META_SOCIAL_CALLBACK_PATH : EMBEDDED_SIGNUP_CALLBACK_PATH, base.origin).toString()
}

type OAuthNoncePersist = (organizationId: string, nonceHash: string, expiresAt: string) => Promise<void>
type OAuthNonceConsume = (organizationId: string, nonceHash: string) => Promise<boolean>

async function persistOAuthStateNonce(
  organizationId: string,
  nonceHash: string,
  expiresAt: string
): Promise<void> {
  const admin = createAdminClient()
  // Expired rows are safe to purge opportunistically; active nonces are untouched.
  await admin.from('meta_embedded_signup_state_nonces')
    .delete().eq('organization_id', organizationId).lt('expires_at', new Date().toISOString())
  const { error } = await admin.from('meta_embedded_signup_state_nonces').insert({
    organization_id: organizationId,
    nonce_hash: nonceHash,
    expires_at: expiresAt,
  })
  if (error) throw new Error('تعذّر إنشاء جلسة ربط آمنة مع Meta. حاول مرة أخرى.')
}

async function consumeOAuthStateNonce(
  organizationId: string,
  nonceHash: string
): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('meta_embedded_signup_state_nonces')
    .delete()
    .eq('organization_id', organizationId)
    .eq('nonce_hash', nonceHash)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()
  return !error && Boolean(data?.id)
}

/** Creates signed, short-lived OAuth state and stores its nonce for one-time use. */
export async function createEmbeddedSignupOAuthState(
  organizationId: string,
  persistNonce: OAuthNoncePersist = persistOAuthStateNonce,
  social?: MetaSocialTarget
): Promise<{ state: string; redirectUri: string }> {
  const redirectUri = getMetaEmbeddedSignupRedirectUri(Boolean(social))
  const issuedAt = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(24).toString('base64url')
  const payload: EmbeddedSignupOAuthStatePayload = {
    version: 1,
    organizationId,
    issuedAt,
    nonce,
    redirectUri,
    ...(social ? { social } : {}),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', oauthStateSecret()).update(encoded).digest('base64url')
  const nonceHash = createHash('sha256').update(nonce).digest('hex')
  await persistNonce(
    organizationId,
    nonceHash,
    new Date((issuedAt + EMBEDDED_SIGNUP_STATE_TTL_SECONDS) * 1000).toISOString()
  )
  return { state: encoded + '.' + signature, redirectUri }
}

/**
 * Verifies the state and atomically consumes its persisted nonce. Replaying a
 * valid signed state therefore fails even if Meta sends the same callback twice.
 */
export async function verifyEmbeddedSignupOAuthState(
  state: string,
  organizationId: string,
  consumeNonce: OAuthNonceConsume = consumeOAuthStateNonce,
  social: MetaSocialChannel | false = false
): Promise<{ redirectUri: string; social?: MetaSocialTarget } | null> {
  try {
    if (!state || state.length > 4096) return null
    const parts = state.split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const encoded = parts[0]
    const suppliedSignature = parts[1]

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
      !Number.isSafeInteger(payload.issuedAt) ||
      payload.issuedAt > now + 60 ||
      now - payload.issuedAt > EMBEDDED_SIGNUP_STATE_TTL_SECONDS ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 16 ||
      typeof payload.redirectUri !== 'string'
    ) return null

    if (social) {
      const target = payload.social
      if (!target || !isMetaSocialChannel(target.channel) || target.channel !== social ||
        (target.pageId !== null && (typeof target.pageId !== 'string' || !/^\d{1,40}$/.test(target.pageId)))) return null
    } else if (payload.social !== undefined) return null

    const canonicalRedirectUri = getMetaEmbeddedSignupRedirectUri(Boolean(social))
    if (payload.redirectUri !== canonicalRedirectUri) return null

    const nonceHash = createHash('sha256').update(payload.nonce).digest('hex')
    const consumed = await consumeNonce(organizationId, nonceHash)
    return consumed ? { redirectUri: canonicalRedirectUri, ...(payload.social ? { social: payload.social } : {}) } : null
  } catch (error) {
    console.warn('Meta OAuth state verification failed', { errorType: error instanceof Error ? error.name : 'unknown' })
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
      return normalized.replace(/\/v\d+\.\d+$/i, '') + `/${META_GRAPH_VERSION}`
    }
    return normalized
  }
  return `https://graph.facebook.com/${META_GRAPH_VERSION}`
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

/** Keep Meta Graph requests bounded so mobile signup cannot hang indefinitely. */
export function fetchMeta(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    cache: 'no-store',
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
  isOnBusinessApp?: boolean
  primaryWaacIds?: string[]
}

export const EmbeddedSignupSessionSchema = z.object({
  code: z.string().trim().min(1).max(4096),
  phoneNumberId: z.string().trim().regex(/^\d{1,40}$/).nullable().optional(),
  wabaId: z.string().trim().regex(/^\d{1,40}$/).nullable().optional(),
  businessPortfolioId: z.string().trim().regex(/^\d{1,40}$/).nullable().optional(),
  redirectUri: z.string().url().max(2048).nullable().optional(),
  displayPhoneNumber: z.string().trim().max(40).nullable().optional(),
  isOnBusinessApp: z.boolean().optional(),
  primaryWaacIds: z.array(z.string().regex(/^\d{1,40}$/)).max(100).optional(),
}).strict()

export const CompleteEmbeddedSignupInputSchema = z.object({
  organizationId: z.string().uuid(),
  businessId: z.string().uuid().nullable(),
  organizationName: z.string().trim().max(200).nullable().optional(),
  requestedMode: z.enum(['coexistence', 'cloud_api']).optional(),
  session: EmbeddedSignupSessionSchema,
}).strict()

export type EmbeddedSignupResult =
  | {
      ok: true
      phoneNumberId: string
      wabaId: string
      businessId: string
      displayNumber: string | null
      isOnBusinessApp: boolean
      message: string
      coexistenceSync?: {
        contacts: { status: string; requestId: string | null; errorCode: number | null }
        history: { status: string; requestId: string | null; errorCode: number | null }
      }
    }
  | { ok: false; error: string; status?: MetaLinkStatus }

/** Exchange the short-lived code from FB.login for a business integration token. */
export async function exchangeMetaCode(code: string, redirectUri?: string | null): Promise<Buffer> {
  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const url = new URL(`${getMetaGraphBaseUrl()}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri)

  const response = await fetchMeta(url.toString(), { method: 'GET' })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: number; error_subcode?: number } } | null
    const code = body?.error?.code
    console.error('Meta code exchange failed', { status: response.status, code })
    throw new MetaLinkError(body?.error?.error_subcode === 36007 ? 'meta_expired' : metaLinkStatusFromGraph(code, response.status))
  }

  // Meta may return either a plain token string or a JSON object.
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return Buffer.from(json.access_token, 'utf8')
  }

  const text = (await response.text()).trim()
  if (!text) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
  // Some responses are form-encoded: access_token=...
  if (text.startsWith('{')) {
    const json = JSON.parse(text) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return Buffer.from(json.access_token, 'utf8')
  }
  if (text.includes('access_token=')) {
    const params = new URLSearchParams(text)
    const token = params.get('access_token')
    if (!token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return Buffer.from(token, 'utf8')
  }
  return Buffer.from(text, 'utf8')
}

async function subscribeAppToWaba(wabaId: string, businessToken: string): Promise<void> {
  const response = await fetchMeta(`${getMetaGraphBaseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  const body = await response.json().catch(() => null) as { success?: boolean; error?: { code?: number } } | null
  if (!response.ok || body?.success !== true) {
    console.error('EmbeddedSignup: subscribe_apps failed', {
      status: response.status,
      code: body?.error?.code,
    })
    const status = metaLinkStatusFromGraph(body?.error?.code, response.status)
    if (status !== 'meta_error') throw new MetaLinkError(status)
    throw new Error('لم تؤكد Meta تفعيل استقبال إشعارات واتساب. تحقق من صلاحيات التطبيق ثم أعد الربط.')
  }
}

export type CoexistenceSyncRequestResult = {
  status: string
  requestId: string | null
  errorCode: number | null
}

/**
 * Ask Meta to sync contacts and chat history once after Coexistence onboarding.
 * A durable unique row is written before the API call so an OAuth callback retry
 * cannot accidentally submit a second one-time request.
 */
async function requestCoexistenceSync(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string
    channelId: string
    phoneNumberId: string
    accessToken: string
    syncType: 'smb_app_state_sync' | 'history'
  }
): Promise<CoexistenceSyncRequestResult> {
  const { data: claim, error: claimError } = await admin
    .from('whatsapp_coexistence_sync_requests')
    .insert({
      organization_id: input.organizationId,
      channel_id: input.channelId,
      phone_number_id: input.phoneNumberId,
      sync_type: input.syncType,
      status: 'requesting',
    })
    .select('id')
    .single()

  if (claimError?.code === '23505') {
    const { data: existing, error: readError } = await admin
      .from('whatsapp_coexistence_sync_requests')
      .select('status, request_id, error_code')
      .eq('organization_id', input.organizationId)
      .eq('channel_id', input.channelId)
      .eq('phone_number_id', input.phoneNumberId)
      .eq('sync_type', input.syncType)
      .maybeSingle()
    if (readError) throw new Error('تعذّر قراءة حالة مزامنة WhatsApp Business.')
    return {
      status: String(existing?.status ?? 'unknown'),
      requestId: typeof existing?.request_id === 'string' ? existing.request_id : null,
      errorCode: typeof existing?.error_code === 'number' ? existing.error_code : null,
    }
  }
  if (claimError || !claim?.id) {
    console.error('EmbeddedSignup: coexistence sync claim failed', claimError)
    throw new Error('تعذّر تجهيز مزامنة WhatsApp Business.')
  }

  try {
    const url = new URL(
      getMetaGraphBaseUrl() + '/' + encodeURIComponent(input.phoneNumberId) + '/smb_app_data'
    )
    const response = await fetchMeta(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + input.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        sync_type: input.syncType,
      }),
      cache: 'no-store',
    })
    const body = await response.json().catch(() => null) as {
      request_id?: string
      data?: { request_id?: string }
      error?: { code?: number; message?: string }
    } | null
    const requestId = body?.request_id ?? body?.data?.request_id ?? null
    if (!response.ok || !requestId) {
      const errorCode = typeof body?.error?.code === 'number' ? body.error.code : null
      await admin.from('whatsapp_coexistence_sync_requests').update({
        status: 'failed',
        error_code: errorCode,
        error_message: errorCode ? 'meta_error_' + errorCode : 'meta_sync_request_not_confirmed',
        updated_at: new Date().toISOString(),
      }).eq('id', claim.id).eq('organization_id', input.organizationId)
      return { status: 'failed', requestId: null, errorCode }
    }

    const { error: updateError } = await admin
      .from('whatsapp_coexistence_sync_requests')
      .update({
        status: 'requested',
        request_id: requestId,
        requested_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.id)
      .eq('organization_id', input.organizationId)
    if (updateError) {
      console.error('EmbeddedSignup: sync accepted by Meta but local request state was not saved', {
        syncType: input.syncType,
        error: updateError,
      })
      return { status: 'accepted_unrecorded', requestId, errorCode: null }
    }
    return { status: 'requested', requestId, errorCode: null }
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error &&
      typeof (error as { code?: unknown }).code === 'number'
      ? (error as { code: number }).code
      : null
    await admin.from('whatsapp_coexistence_sync_requests').update({
      status: 'failed',
      error_code: errorCode,
      error_message: 'meta_sync_request_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', claim.id).eq('organization_id', input.organizationId)
    console.error('EmbeddedSignup: coexistence sync request failed', {
      syncType: input.syncType,
      errorCode,
    })
    return { status: 'failed', requestId: null, errorCode }
  }
}

/** Both one-time sync requests are independent; attempt each even if the other fails. */
async function requestCoexistenceDataSync(
  admin: ReturnType<typeof createAdminClient>,
  input: { organizationId: string; channelId: string; phoneNumberId: string; accessToken: string }
): Promise<{
  contacts: CoexistenceSyncRequestResult
  history: CoexistenceSyncRequestResult
}> {
  const contacts = await requestCoexistenceSync(admin, { ...input, syncType: 'smb_app_state_sync' })
  const history = await requestCoexistenceSync(admin, { ...input, syncType: 'history' })
  return { contacts, history }
}

async function fetchVerifiedPhoneNumber(
  phoneNumberId: string,
  businessToken: string
): Promise<{ displayPhoneNumber: string | null; isOnBizApp: boolean; platformType: string | null }> {
  const url = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(phoneNumberId)}`)
  url.searchParams.set('fields', 'id,display_phone_number,verified_name,is_on_biz_app,platform_type')
  const response = await fetchMeta(url.toString(), {
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  const body = await response.json().catch(() => null) as {
    id?: string
    display_phone_number?: string
    is_on_biz_app?: boolean
    platform_type?: string
    error?: { code?: number }
  } | null
  if (!response.ok || body?.id !== phoneNumberId) {
    const status = metaLinkStatusFromGraph(body?.error?.code, response.status)
    if (status !== 'meta_error') throw new MetaLinkError(status)
    console.error('EmbeddedSignup: phone verification failed', {
      status: response.status,
      code: body?.error?.code,
    })
    throw new Error('لم تتمكن Meta من التحقق من رقم واتساب المرتبط. أعد الربط وتأكد من اختيار الرقم الصحيح.')
  }
  return { displayPhoneNumber: body.display_phone_number ?? null, isOnBizApp: body.is_on_biz_app === true, platformType: body.platform_type ?? null }
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
    error?: { code?: number }
  } | null
  if (!response.ok || !body?.data?.some((phone) => phone.id === phoneNumberId)) {
    const status = metaLinkStatusFromGraph(body?.error?.code, response.status)
    if (status !== 'meta_error') throw new MetaLinkError(status)
    console.error('EmbeddedSignup: phone/WABA association failed', {
      status: response.status,
      code: body?.error?.code,
    })
    throw new Error('رقم واتساب الذي أعادته Meta لا يتبع حساب الأعمال المحدد. أعد اختيار الحساب والرقم.')
  }
}

type GraphListResponse<T> = { data?: T[]; error?: { message?: string } }

export type MetaTokenDebugResult = {
  scopes: string[]
  expiresAt: number | null
  granularScopes: Array<{ scope?: string; target_ids?: string[] }>
  grantedWabaIds: string[]
}

/** Always validate the exchanged token, even when IDs came from the browser. */
export async function debugCustomerAccessToken(tokenBuffer: Buffer): Promise<MetaTokenDebugResult> {
  return debugMetaAccessToken(tokenBuffer, ['whatsapp_business_management', 'whatsapp_business_messaging'])
}

export async function debugMetaAccessToken(tokenBuffer: Buffer, requiredScopes: readonly string[]): Promise<MetaTokenDebugResult> {
  if (!Buffer.isBuffer(tokenBuffer) || tokenBuffer.length === 0) {
    throw new Error('تعذّر التحقق من التفويض الذي أعادته Meta. أعد الربط.')
  }
  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const url = new URL(getMetaGraphBaseUrl() + '/debug_token')
  url.searchParams.set('input_token', tokenBuffer.toString('utf8'))
  url.searchParams.set('access_token', appId + '|' + appSecret)

  const response = await fetchMeta(url.toString(), { cache: 'no-store' })
  const body = await response.json().catch(() => null) as {
    data?: {
      is_valid?: boolean
      app_id?: string | number
      scopes?: string[]
      expires_at?: number
      granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>
    }
    error?: { code?: number }
  } | null

  if (!response.ok || !body?.data) {
    console.error('EmbeddedSignup: token debug failed', {
      status: response.status,
      code: body?.error?.code,
    })
    throw new MetaLinkError(metaLinkStatusFromGraph(body?.error?.code, response.status))
  }
  const data = body.data
  if (String(data.app_id ?? '') !== appId) {
    throw new MetaLinkError('meta_permission')
  }

  const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : null
  if (data.is_valid !== true || (expiresAt && expiresAt <= Math.floor(Date.now() / 1000))) {
    throw new MetaLinkError('meta_expired')
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes : []
  if (requiredScopes.some((scope) => !scopes.includes(scope))) {
    throw new MetaLinkError('meta_permission')
  }

  const granularScopes = Array.isArray(data.granular_scopes) ? data.granular_scopes : []
  const managementGrant = granularScopes.find((grant) => grant.scope === 'whatsapp_business_management')
  if (requiredScopes.includes('whatsapp_business_management') && !managementGrant) {
    throw new MetaLinkError('meta_permission')
  }
  const grantedWabaIds = (managementGrant?.target_ids ?? [])
    .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)
  return { scopes, expiresAt, granularScopes, grantedWabaIds }
}

export function hasMetaWabaAccess(debug: MetaTokenDebugResult, wabaId: string): boolean {
  const grant = debug.granularScopes.find((scope) => scope.scope === 'whatsapp_business_management')
  return Boolean(grant && (!grant.target_ids || grant.target_ids.includes(wabaId)))
}

async function resolveSignupResources(
  session: EmbeddedSignupSession,
  businessToken: string,
  grantedWabaIds: string[]
): Promise<{ phoneNumberId: string; wabaId: string }> {
  const businessWabaIds: string[] = []
  if (session.businessPortfolioId && !session.wabaId) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const businessUrl = new URL(getMetaGraphBaseUrl() + '/' + encodeURIComponent(session.businessPortfolioId) + '/' + edge)
      businessUrl.searchParams.set('fields', 'id')
      businessUrl.searchParams.set('limit', '100')
      const businessResponse = await fetchMeta(businessUrl.toString(), {
        headers: { Authorization: 'Bearer ' + businessToken },
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
    const url = new URL(getMetaGraphBaseUrl() + '/' + encodeURIComponent(wabaId) + '/phone_numbers')
    url.searchParams.set('fields', 'id')
    url.searchParams.set('limit', '100')
    const response = await fetchMeta(url.toString(), {
      headers: { Authorization: 'Bearer ' + businessToken },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => null) as GraphListResponse<{ id?: string }> | null
    if (!response.ok) {
      console.error('EmbeddedSignup: phone discovery failed', {
        status: response.status,
        error: body?.error?.message ?? 'Meta denied access to WABA phone numbers',
      })
      continue
    }
    const phones = (body?.data ?? []).map((phone) => phone.id).filter((id): id is string => Boolean(id))
    const phoneNumberId = session.phoneNumberId
      ? phones.find((id) => id === session.phoneNumberId)
      : phones.length === 1 ? phones[0] : undefined
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
export async function completeEmbeddedSignup(input: unknown): Promise<EmbeddedSignupResult> {
  const parsedInput = CompleteEmbeddedSignupInputSchema.safeParse(input)
  if (!parsedInput.success) {
    return { ok: false, error: 'بيانات الربط من Meta غير مكتملة أو غير صالحة. أعد بدء الربط.' }
  }
  const { organizationId, businessId: suppliedBusinessId, organizationName, requestedMode, session } = parsedInput.data
  let tokenBuffer: Buffer | null = null

  try {
    tokenBuffer = await exchangeMetaCode(session.code, session.redirectUri)
    const tokenDebug = await debugCustomerAccessToken(tokenBuffer)
    const businessToken = tokenBuffer.toString('utf8')
    const resources = await resolveSignupResources(session, businessToken, tokenDebug.grantedWabaIds)
    const phoneNumberId = resources.phoneNumberId
    const wabaId = resources.wabaId
    if (!hasMetaWabaAccess(tokenDebug, wabaId)) {
      throw new MetaLinkError('meta_permission')
    }

    const admin = createAdminClient()
    const resolvedBusinessId = await ensureBusinessId(admin, organizationId, suppliedBusinessId, organizationName)
    await verifyPhoneBelongsToWaba(wabaId, phoneNumberId, businessToken)
    const phoneState = await fetchVerifiedPhoneNumber(phoneNumberId, businessToken)
    const connectionMode = resolveWhatsAppConnectionMode({
      isOnBizApp: phoneState.isOnBizApp,
      platformType: phoneState.platformType,
      sessionMarkedCoexistence: session.isOnBusinessApp === true,
    })
    if (requestedMode && connectionMode !== requestedMode) {
      throw new Error(connectionMode === 'cloud_api'
        ? 'لم تؤكد ميتا وضع التعايش لهذا الرقم. اختر بطاقة الربط السحابي فقط.'
        : 'أكدت ميتا التعايش مع تطبيق واتساب للأعمال. اختر بطاقة وضع التعايش.')
    }
    const displayNumber = phoneState.displayPhoneNumber ??
      (session.displayPhoneNumber ? normalizeChannelNumber(session.displayPhoneNumber) : null)
    const primaryWaacIds = Array.from(new Set((session.primaryWaacIds ?? [])
      .map((id) => String(id).trim()).filter((id) => /^\d{1,40}$/.test(id)))).slice(0, 100)

    await subscribeAppToWaba(wabaId, businessToken)
    const channelId = await bindMetaChannel(admin, {
      organizationId, businessId: resolvedBusinessId, channelType: 'whatsapp',
      assetId: phoneNumberId, accessToken: businessToken,
      whatsapp: { wabaId, displayNumber, connectionMode, primaryWaacIds },
    })

    const coexistenceSync = connectionMode === 'coexistence'
      ? await requestCoexistenceDataSync(admin, {
          organizationId,
          channelId,
          phoneNumberId,
          accessToken: businessToken,
        })
      : undefined

    if (displayNumber) {
      const { error: profileUpdateError } = await admin.from('business_profiles')
        .update({ public_phone_number: displayNumber, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (profileUpdateError) console.warn('EmbeddedSignup: could not sync public phone number', profileUpdateError.message)
    }

    return {
      ok: true,
      phoneNumberId,
      wabaId,
      businessId: resolvedBusinessId,
      displayNumber,
      isOnBusinessApp: connectionMode === 'coexistence',
      message: connectionMode === 'coexistence'
        ? (coexistenceSync?.contacts.status === 'requested' && coexistenceSync.history.status === 'requested'
          ? 'تم الربط بوضع التعايش مع تطبيق واتساب للأعمال. طلبنا مزامنة جهات الاتصال وسجل المحادثات.'
          : 'تم الربط بوضع التعايش مع تطبيق واتساب للأعمال. القناة جاهزة للاستخدام، ومزامنة البيانات غير مكتملة.')
        : 'تم حفظ تفويض واتساب. إذا كانت القناة تحتاج إلى إعداد، أكمل تسجيل الرقم برمز التحقق بخطوتين.',
      ...(coexistenceSync ? { coexistenceSync } : {}),
    }
  } catch (error) {
    if (error instanceof MetaLinkError) return { ok: false, error: error.message, status: error.status }
    console.error('EmbeddedSignup: complete failed', { errorType: error instanceof Error ? error.name : 'unknown' })
    const message = error instanceof Error && /^(تعذّر|لم تتمكن|لم تؤكد|رفضت Meta|انتهت|تم حفظ)/.test(error.message)
      ? error.message
      : 'تعذّر إتمام ربط واتساب. لم يتم تفعيل القناة لأن التحقق أو حفظ بيانات الربط لم يكتمل.'
    return { ok: false, error: message }
  } finally {
    // Buffers are mutable and cleared here. Transient JS strings cannot be erased reliably.
    tokenBuffer?.fill(0)
  }
}

/** True when the public env needed to launch the popup is present. */
export function isEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
