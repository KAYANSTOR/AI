/**
 * OAuth `state`: an encrypted (A256GCM) JWT carrying the nonce, the PKCE verifier and
 * the post-login destination. It is bound to the initiating browser through a random
 * value kept in an HttpOnly cookie (only its SHA-256 is sealed in the state), so a
 * state minted for another browser, a tampered state or an expired one is rejected.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'

export type OAuthProvider = 'google'
export type OAuthMode = 'login' | 'signup'
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google']
export const OAUTH_STATE_TTL_SECONDS = 10 * 60
export const OAUTH_BINDING_COOKIE = 'kayan_oauth_binding'
const DEFAULT_RETURN_TO = '/dashboard'

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'google'
}

/** Same-site relative paths only; anything that could leave the origin falls back. */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return DEFAULT_RETURN_TO
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { return DEFAULT_RETURN_TO }
  for (const candidate of [value, decoded]) {
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return DEFAULT_RETURN_TO
    if (/[\u0000-\u001f]/.test(candidate)) return DEFAULT_RETURN_TO
  }
  return value
}

function stateKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is required for OAuth state.')
  return createHash('sha256').update(`kayan-oauth-state:v1:${secret}`).digest()
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function random(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export type OAuthStatePayload = {
  provider: OAuthProvider
  mode: OAuthMode
  returnTo: string
  nonce: string
  codeVerifier: string
}

export async function createOAuthState(
  input: { provider: OAuthProvider; mode: OAuthMode; returnTo: unknown },
  nowMs = Date.now()
): Promise<OAuthStatePayload & { state: string; binding: string }> {
  const binding = random()
  const payload: OAuthStatePayload = {
    provider: input.provider,
    mode: input.mode === 'signup' ? 'signup' : 'login',
    returnTo: sanitizeReturnTo(input.returnTo),
    nonce: random(24),
    codeVerifier: random(48),
  }
  const iat = Math.floor(nowMs / 1000)
  const state = await new EncryptJWT({ ...payload, bh: sha256(binding) })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + OAUTH_STATE_TTL_SECONDS)
    .setAudience('kayan-oauth')
    .encrypt(stateKey())
  return { ...payload, state, binding }
}

export async function readOAuthState(
  state: unknown,
  binding: string | undefined | null,
  provider: OAuthProvider
): Promise<OAuthStatePayload | null> {
  if (typeof state !== 'string' || state.length > 4096 || !binding) return null
  try {
    const { payload } = await jwtDecrypt(state, stateKey(), { audience: 'kayan-oauth', keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })
    if (payload.provider !== provider) return null
    const expected = Buffer.from(String(payload.bh ?? ''), 'utf8')
    const actual = Buffer.from(sha256(binding), 'utf8')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    if (typeof payload.nonce !== 'string' || typeof payload.codeVerifier !== 'string') return null
    return {
      provider,
      mode: payload.mode === 'signup' ? 'signup' : 'login',
      returnTo: sanitizeReturnTo(payload.returnTo),
      nonce: payload.nonce,
      codeVerifier: payload.codeVerifier,
    }
  } catch {
    return null
  }
}
