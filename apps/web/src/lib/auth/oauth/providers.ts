/**
 * Google OpenID Connect: authorization URL, code exchange and id_token
 * verification (signature via Google JWKS, issuer, audience, expiry, nonce).
 * Missing credentials report "not configured" without throwing at build time.
 */
import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { OAuthProvider } from './state'

type Env = Record<string, string | undefined>

export type GoogleConfig = { provider: 'google'; clientId: string; clientSecret: string }
export type OAuthProviderConfig = GoogleConfig

export type OAuthProfile = {
  provider: OAuthProvider
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

const ENDPOINTS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
  },
} as const

export const OAUTH_ENV_VARS: Record<OAuthProvider, string[]> = {
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
}

export function getOAuthProviderConfig(provider: OAuthProvider, env: Env = process.env): OAuthProviderConfig | null {
  if (provider !== 'google') return null
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || ''
  return clientId && clientSecret ? { provider: 'google', clientId, clientSecret } : null
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function buildAuthorizationUrl(
  config: OAuthProviderConfig,
  input: { state: string; nonce: string; codeChallenge: string; redirectUri: string }
): string {
  const url = new URL(ENDPOINTS.google.authorize)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', input.state)
  url.searchParams.set('nonce', input.nonce)
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Exchanges the authorization code for an id_token (server-to-server, TLS). */
export async function exchangeAuthorizationCode(
  config: OAuthProviderConfig,
  input: { code: string; codeVerifier: string; redirectUri: string },
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  if (!input.code || input.code.length > 2048) return null
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: input.codeVerifier,
  })
  const response = await fetchImpl(ENDPOINTS.google.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return null
  const json = (await response.json().catch(() => null)) as { id_token?: unknown } | null
  return typeof json?.id_token === 'string' ? json.id_token : null
}

const remoteJwks = new Map<OAuthProvider, JWTVerifyGetKey>()
function providerJwks(provider: OAuthProvider): JWTVerifyGetKey {
  let jwks = remoteJwks.get(provider)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(ENDPOINTS[provider].jwks))
    remoteJwks.set(provider, jwks)
  }
  return jwks
}

export async function verifyIdToken(
  config: OAuthProviderConfig,
  idToken: string,
  expectedNonce: string,
  jwks: JWTVerifyGetKey = providerJwks(config.provider)
): Promise<OAuthProfile | null> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: [...ENDPOINTS[config.provider].issuers],
      audience: config.clientId,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 60,
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) return null
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null
    const verifiedClaim = payload.email_verified
    const emailVerified = Boolean(email) && (verifiedClaim === true || verifiedClaim === 'true')
    const name = typeof payload.name === 'string' ? payload.name.slice(0, 120) : null
    return { provider: config.provider, subject: payload.sub, email, emailVerified, name }
  } catch {
    return null
  }
}
