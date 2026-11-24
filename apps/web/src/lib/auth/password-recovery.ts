import { getSql } from '@/lib/db/pool'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'
import { renderPasswordResetEmail } from '@/lib/email/templates'
import { consumeEmailToken, pgEmailTokenStore } from './email-tokens'
import { hashPassword } from './password'
import { requestPasswordReset } from './password-recovery-flow'
import { logSecurityEvent } from './security-log'
import { isSiteUrlConfigured, siteUrl } from './site-url'

export function isPasswordRecoveryConfigured(): boolean {
  return isEmailConfigured() && isSiteUrlConfigured()
}

/** Always resolves to the same generic message (no account enumeration). */
export async function sendPasswordReset(email: string, ip?: string | null): Promise<{ message: string }> {
  return requestPasswordReset(email, {
    store: pgEmailTokenStore,
    async findUserByEmail(normalized) {
      const rows = await getSql().unsafe<{ id: string; email: string }[]>(
        'select id::text as id, email from auth.users where lower(email) = $1 and deleted_at is null limit 1',
        [normalized]
      )
      return rows[0] ?? null
    },
    async sendEmail(to, resetUrl) {
      const result = await sendEmail({ to, ...renderPasswordResetEmail({ url: resetUrl }) })
      if (!result.sent) throw new Error(`reset_email_${result.reason}`)
    },
    logEvent: (event, userId) => logSecurityEvent({ event, userId, ip, email }),
    resetUrl(token) {
      const url = new URL(siteUrl('/reset-password'))
      url.searchParams.set('token', token)
      return url.toString()
    },
  })
}

/** Consumes the 30-minute single-use token, sets the password and ends all sessions. */
export async function completePasswordReset(token: string, password: string, ip?: string | null): Promise<boolean> {
  const consumed = await consumeEmailToken(pgEmailTokenStore, token, 'reset_password')
  if (!consumed) {
    await logSecurityEvent({ event: 'password_reset_token_rejected', ip })
    return false
  }
  const passwordHash = await hashPassword(password)
  const updated = await getSql().unsafe<{ id: string }[]>(
    `update auth.users
        set encrypted_password = $2,
            session_version = session_version + 1,
            email_verified_at = coalesce(email_verified_at, now()),
            updated_at = now()
      where id = $1::uuid and lower(email) = $3 and deleted_at is null
      returning id`,
    [consumed.userId, passwordHash, consumed.email]
  )
  if (!updated[0]) return false
  await pgEmailTokenStore.invalidateOpen(consumed.userId, 'reset_password', new Date())
  await logSecurityEvent({ event: 'password_reset_completed', userId: consumed.userId, ip })
  return true
}
