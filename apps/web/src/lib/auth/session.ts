/**
 * Stateless signed sessions.
 *
 * The session cookie carries a short JWT (HS256, AUTH_SECRET) with the user id and
 * email. It is HttpOnly, SameSite=Lax and Secure in production, so browser scripts can
 * never read it. Each user row has a `session_version`; changing a password bumps it,
 * which invalidates every session issued before the change.
 */
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'fd_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
/** Sessions older than this are re-issued on the next request (sliding expiry). */
export const SESSION_REFRESH_AFTER_SECONDS = 60 * 60 * 24

export type SessionClaims = {
  sub: string
  email: string
  sv: number
  iat: number
  exp: number
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

export function isAuthSecretConfigured(): boolean {
  const secret = process.env.AUTH_SECRET?.trim()
  return Boolean(secret && secret.length >= 32)
}

export async function signSession(user: { id: string; email: string; sessionVersion: number }): Promise<string> {
  return new SignJWT({ email: user.email, sv: user.sessionVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer('frontdesk')
    .setAudience('frontdesk-web')
    .sign(secretKey())
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token || !isAuthSecretConfigured()) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      issuer: 'frontdesk',
      audience: 'frontdesk-web',
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null
    return {
      sub: payload.sub,
      email: payload.email,
      sv: typeof payload.sv === 'number' ? payload.sv : 0,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    }
  } catch {
    return null
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}
