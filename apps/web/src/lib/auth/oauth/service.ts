/** Production wiring for OAuth account resolution (PostgreSQL + security log). */
import { logSecurityEvent } from '../security-log'
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../terms'
import {
  createOAuthUser,
  findOAuthIdentityUserId,
  findUserByEmail,
  findUserById,
  linkOAuthIdentity,
  markEmailVerified,
  revokePasswordAndSessions,
  type AuthUser,
} from '../users'
import type { OAuthAccountDeps, OAuthUser } from './account'

function toOAuthUser(user: AuthUser | null): OAuthUser | null {
  return user ? { id: user.id, email: user.email, sessionVersion: user.sessionVersion, bannedUntil: user.bannedUntil, emailVerifiedAt: user.emailVerifiedAt } : null
}

export function oauthAccountDeps(ip: string | null): OAuthAccountDeps {
  return {
    findIdentityUserId: (provider, subject) => findOAuthIdentityUserId(provider, subject),
    findUserById: async (id) => toOAuthUser(await findUserById(id)),
    findUserByEmail: async (email) => toOAuthUser(await findUserByEmail(email)),
    linkIdentity: (userId, profile) => linkOAuthIdentity(userId, profile.provider, profile.subject, profile.email),
    markEmailVerified,
    revokePasswordAndSessions,
    async createOAuthUser({ email, name, provider }) {
      const user = await createOAuthUser({
        email,
        metadata: {
          organization_name_pending: true,
          business_type_pending: true,
          full_name: name ?? undefined,
          signup_method: provider,
        },
        termsVersion: TERMS_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      })
      return toOAuthUser(user)!
    },
    logEvent: (event, userId, metadata) => logSecurityEvent({ event, userId, ip, metadata }),
  }
}
