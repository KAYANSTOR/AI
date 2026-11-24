/**
 * Productivity connector service (Gmail / Google Calendar).
 *
 * - OAuth tokens are encrypted with AES-256-GCM before storage and are only decrypted
 *   in server code that is about to call Google.
 * - The signed OAuth `state` binds the callback to the owner who started it, so a
 *   connect link can never attach another tenant's mailbox.
 * - Connections are per (org, user, provider) and can be revoked from the assistant.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { decryptSecret, encryptSecret, CredentialConfigError } from '@/lib/credentials/service'
import {
  CONNECTORS,
  isConnectorProvider,
  type ConnectorConnectionRow,
  type ConnectorProvider,
  type ConnectorPublicView,
  type GoogleTokens,
} from './types'

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'
const STATE_TTL_MS = 10 * 60 * 1000
const REFRESH_MARGIN_MS = 60 * 1000

export type ConnectorOwner = { organizationId: string; userId: string }

export type GoogleOAuthConfig = { clientId: string; clientSecret: string }

/** Reuses the platform Google OAuth client used for sign-in. */
export function getGoogleOAuthConfig(env: Record<string, string | undefined> = process.env): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || ''
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

function stateKey(): Buffer {
  const raw = process.env.CONNECTOR_STATE_SECRET?.trim() || process.env.CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new CredentialConfigError(
      'CONNECTOR_STATE_SECRET (or CREDENTIAL_ENCRYPTION_KEY) is required to sign connector OAuth state.'
    )
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length < 32) throw new CredentialConfigError('Connector state secret must be at least 32 bytes.')
  return key
}

export type ConnectorStatePayload = {
  organizationId: string
  userId: string
  provider: ConnectorProvider
  exp: number
}

export function signConnectorState(payload: ConnectorStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', stateKey()).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyConnectorState(state: string, now: Date = new Date()): ConnectorStatePayload | null {
  const [body, signature] = String(state ?? '').split('.')
  if (!body || !signature) return null
  let expected: string
  try {
    expected = createHmac('sha256', stateKey()).update(body).digest('base64url')
  } catch {
    return null
  }
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ConnectorStatePayload
    if (!isConnectorProvider(parsed.provider) || !parsed.organizationId || !parsed.userId) return null
    if (!Number.isFinite(parsed.exp) || parsed.exp < now.getTime()) return null
    return parsed
  } catch {
    return null
  }
}

export function buildConnectorAuthorizeUrl(input: {
  provider: ConnectorProvider
  state: string
  redirectUri: string
  config?: GoogleOAuthConfig | null
  env?: Record<string, string | undefined>
}): string {
  const config = input.config ?? getGoogleOAuthConfig(input.env ?? process.env)
  if (!config) throw new Error('google_connector_not_configured')
  const url = new URL(GOOGLE_AUTHORIZE)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', CONNECTORS[input.provider].scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', input.state)
  return url.toString()
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

function toTokens(payload: TokenResponse): GoogleTokens {
  if (!payload.access_token) throw new Error('google_token_exchange_failed')
  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Math.max(0, payload.expires_in) * 1000).toISOString()
    : null
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? null,
    token_type: payload.token_type ?? 'Bearer',
    scope: payload.scope ?? null,
    expires_at: expiresAt,
  }
}

export async function exchangeGoogleCode(input: {
  code: string
  redirectUri: string
  config?: GoogleOAuthConfig | null
  fetchImpl?: typeof fetch
}): Promise<GoogleTokens> {
  const config = input.config ?? getGoogleOAuthConfig()
  if (!config) throw new Error('google_connector_not_configured')
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })
  const payload = (await response.json().catch(() => null)) as TokenResponse | null
  if (!response.ok || !payload) throw new Error('google_token_exchange_failed')
  return toTokens(payload)
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string
  config?: GoogleOAuthConfig | null
  fetchImpl?: typeof fetch
}): Promise<GoogleTokens> {
  const config = input.config ?? getGoogleOAuthConfig()
  if (!config) throw new Error('google_connector_not_configured')
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  })
  const payload = (await response.json().catch(() => null)) as TokenResponse | null
  if (!response.ok || !payload?.access_token) throw new Error('google_token_refresh_failed')
  return { ...toTokens(payload), refresh_token: payload.refresh_token ?? input.refreshToken }
}

export async function fetchGoogleAccountEmail(tokens: GoogleTokens, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(GOOGLE_USERINFO, {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    })
    if (!response.ok) return null
    const payload = (await response.json().catch(() => null)) as { email?: string } | null
    const email = payload?.email?.trim() ?? ''
    return /^[^@\s]{1,64}@[^@\s]{1,190}$/.test(email) ? email.slice(0, 254) : null
  } catch {
    return null
  }
}

export function parseStoredTokens(ciphertext: string): GoogleTokens {
  const parsed = JSON.parse(decryptSecret(ciphertext)) as GoogleTokens
  if (!parsed?.access_token) throw new Error('connector_tokens_malformed')
  return parsed
}

export async function saveConnection(
  db: DbClient,
  owner: ConnectorOwner,
  input: { provider: ConnectorProvider; tokens: GoogleTokens; accountEmail: string | null; scopes?: string[] }
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from('user_tool_connections').upsert(
    {
      org_id: owner.organizationId,
      user_id: owner.userId,
      provider: input.provider,
      account_email: input.accountEmail,
      scopes: input.scopes ?? input.tokens.scope?.split(/\s+/).filter(Boolean) ?? [],
      encrypted_tokens: encryptSecret(JSON.stringify(input.tokens)),
      token_expires_at: input.tokens.expires_at ?? null,
      status: 'active',
      last_error: null,
      connected_at: now,
      updated_at: now,
    },
    { onConflict: 'org_id,user_id,provider' }
  )
  if (error) throw new Error('connector_save_failed')
}

export async function getConnection(
  db: DbClient,
  owner: ConnectorOwner,
  provider: ConnectorProvider
): Promise<ConnectorConnectionRow | null> {
  const { data, error } = await db
    .from('user_tool_connections')
    .select('*')
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error('connector_lookup_failed')
  return (data as unknown as ConnectorConnectionRow | null) ?? null
}

export async function listConnections(db: DbClient, owner: ConnectorOwner): Promise<ConnectorPublicView[]> {
  const { data, error } = await db
    .from('user_tool_connections')
    .select('provider, status, account_email, scopes, token_expires_at, last_error, connected_at')
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
  if (error) throw new Error('connector_list_failed')
  const rows = new Map(((data ?? []) as unknown as ConnectorConnectionRow[]).map((row) => [row.provider, row]))
  return (Object.keys(CONNECTORS) as ConnectorProvider[]).map((provider) => {
    const row = rows.get(provider)
    return {
      provider,
      labelAr: CONNECTORS[provider].labelAr,
      connected: row?.status === 'active',
      status: row?.status ?? 'disconnected',
      accountEmail: row?.account_email ?? null,
      scopes: row?.scopes ?? [],
      tokenExpiresAt: row?.token_expires_at ?? null,
      lastError: row?.last_error ?? null,
      connectedAt: row?.connected_at ?? null,
    }
  })
}

export async function disconnectConnection(
  db: DbClient,
  owner: ConnectorOwner,
  provider: ConnectorProvider
): Promise<boolean> {
  const { data, error } = await db
    .from('user_tool_connections')
    .update({
      status: 'revoked',
      encrypted_tokens: null,
      token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .eq('provider', provider)
    .select('id')
  if (error) throw new Error('connector_disconnect_failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * Returns a usable access token, refreshing it when it is about to expire. A revoked
 * or missing connection fails closed with a clear error for the tool executor.
 */
export async function getValidAccessToken(
  db: DbClient,
  owner: ConnectorOwner,
  provider: ConnectorProvider,
  deps: { fetchImpl?: typeof fetch; now?: Date; config?: GoogleOAuthConfig | null } = {}
): Promise<string> {
  const connection = await getConnection(db, owner, provider)
  if (!connection || connection.status !== 'active' || !connection.encrypted_tokens) {
    throw new Error('connector_not_connected')
  }
  const tokens = parseStoredTokens(connection.encrypted_tokens)
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : null
  const now = (deps.now ?? new Date()).getTime()
  if (expiresAt && expiresAt - REFRESH_MARGIN_MS > now) return tokens.access_token
  if (!tokens.refresh_token) return tokens.access_token

  try {
    const refreshed = await refreshGoogleAccessToken({
      refreshToken: tokens.refresh_token,
      config: deps.config,
      fetchImpl: deps.fetchImpl,
    })
    const merged: GoogleTokens = { ...tokens, ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token }
    await db
      .from('user_tool_connections')
      .update({
        encrypted_tokens: encryptSecret(JSON.stringify(merged)),
        token_expires_at: merged.expires_at ?? null,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('org_id', owner.organizationId)
      .eq('user_id', owner.userId)
    return merged.access_token
  } catch (error) {
    await db
      .from('user_tool_connections')
      .update({
        status: 'error',
        last_error: (error instanceof Error ? error.message : 'token_refresh_failed').slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('org_id', owner.organizationId)
      .eq('user_id', owner.userId)
    throw new Error('connector_reconnect_required')
  }
}

export function connectorStateTtl(now: Date = new Date()): number {
  return now.getTime() + STATE_TTL_MS
}
