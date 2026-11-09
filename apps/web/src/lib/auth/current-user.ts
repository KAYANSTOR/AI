import { cookies } from 'next/headers'
import { cache } from 'react'
import { SESSION_COOKIE, verifySession } from './session'
import { findUserById } from './users'

export type CurrentUser = { id: string; email: string; userMetadata: Record<string, unknown> }

/**
 * The signed-in user for this request, or null.
 * The token signature is checked first; the account is then re-read so a password
 * change, ban or deletion takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!claims) return null

  const user = await findUserById(claims.sub).catch(() => null)
  if (!user || user.sessionVersion !== claims.sv) return null
  if (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) return null

  return { id: user.id, email: user.email, userMetadata: user.userMetadata }
})
