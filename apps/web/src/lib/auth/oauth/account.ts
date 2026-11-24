/**
 * Maps a verified OAuth profile to a KAYAN account:
 *  1. a known (provider, subject) signs in its linked user;
 *  2. otherwise a provider-verified e-mail that already has an account is linked. If
 *     that account never proved its e-mail, its password and sessions are revoked so
 *     someone who pre-registered the address cannot keep access (pre-hijack defence);
 *  3. otherwise a new verified user is created (the DB trigger provisions the workspace).
 * Unverified provider e-mails are never linked or used to create accounts.
 */
import type { OAuthProfile } from './providers'

export type OAuthUser = {
  id: string
  email: string | null
  sessionVersion: number
  bannedUntil: string | null
  emailVerifiedAt: string | null
}

export type OAuthAccountDeps = {
  findIdentityUserId: (provider: OAuthProfile['provider'], subject: string) => Promise<string | null>
  findUserById: (id: string) => Promise<OAuthUser | null>
  findUserByEmail: (email: string) => Promise<OAuthUser | null>
  linkIdentity: (userId: string, profile: OAuthProfile) => Promise<void>
  markEmailVerified: (userId: string) => Promise<void>
  revokePasswordAndSessions: (userId: string) => Promise<void>
  createOAuthUser: (input: { email: string; name: string | null; provider: OAuthProfile['provider'] }) => Promise<OAuthUser>
  logEvent: (event: string, userId: string | null, metadata: Record<string, unknown>) => Promise<void>
}

export type OAuthAccountResult =
  | { kind: 'login' | 'linked' | 'created'; user: OAuthUser }
  | { kind: 'error'; code: 'email_unverified' | 'suspended' }

function isSuspended(user: OAuthUser): boolean {
  return Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now())
}

export async function resolveOAuthAccount(profile: OAuthProfile, deps: OAuthAccountDeps): Promise<OAuthAccountResult> {
  const meta = { provider: profile.provider }
  const linkedId = await deps.findIdentityUserId(profile.provider, profile.subject)
  if (linkedId) {
    const user = await deps.findUserById(linkedId)
    if (user) {
      if (isSuspended(user)) return { kind: 'error', code: 'suspended' }
      await deps.logEvent('oauth_login', user.id, meta)
      return { kind: 'login', user }
    }
  }

  if (!profile.email || !profile.emailVerified) {
    await deps.logEvent('oauth_rejected_unverified_email', null, meta)
    return { kind: 'error', code: 'email_unverified' }
  }

  const existing = await deps.findUserByEmail(profile.email)
  if (existing) {
    if (isSuspended(existing)) return { kind: 'error', code: 'suspended' }
    await deps.linkIdentity(existing.id, profile)
    if (!existing.emailVerifiedAt) {
      await deps.revokePasswordAndSessions(existing.id)
      await deps.markEmailVerified(existing.id)
      await deps.logEvent('oauth_linked_unverified_account_password_revoked', existing.id, meta)
      const refreshed = await deps.findUserById(existing.id)
      return { kind: 'linked', user: refreshed ?? existing }
    }
    await deps.logEvent('oauth_linked', existing.id, meta)
    return { kind: 'linked', user: existing }
  }

  const created = await deps.createOAuthUser({ email: profile.email, name: profile.name, provider: profile.provider })
  await deps.linkIdentity(created.id, profile)
  await deps.logEvent('oauth_signup', created.id, meta)
  return { kind: 'created', user: created }
}
