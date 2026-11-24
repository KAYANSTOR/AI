/**
 * E-mail verification for e-mail/password accounts: a 24-hour single-use link, a
 * DB-backed resend limit shared by all replicas, and a security-log entry on success.
 */
import { getSql } from '@/lib/db/pool'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'
import { renderVerifyEmail } from '@/lib/email/templates'
import { consumeEmailToken, issueEmailToken, pgEmailTokenStore } from './email-tokens'
import { logSecurityEvent } from './security-log'
import { isSiteUrlConfigured, siteUrl } from './site-url'
import { markEmailVerified } from './users'

export const VERIFY_RESEND_LIMIT = 3
export const VERIFY_RESEND_WINDOW_SECONDS = 3600

export function isEmailVerificationConfigured(): boolean {
  return isEmailConfigured() && isSiteUrlConfigured()
}

export async function sendVerificationEmail(user: { id: string; email: string }): Promise<boolean> {
  if (!isEmailVerificationConfigured()) return false
  const token = await issueEmailToken(pgEmailTokenStore, { userId: user.id, email: user.email, type: 'verify_email' })
  const url = new URL(siteUrl('/verify-email'))
  url.searchParams.set('token', token)
  const result = await sendEmail({ to: user.email, ...renderVerifyEmail({ url: url.toString() }) })
  if (!result.sent) {
    await pgEmailTokenStore.invalidateOpen(user.id, 'verify_email', new Date())
    return false
  }
  await logSecurityEvent({ event: 'email_verification_sent', userId: user.id })
  return true
}

/** Atomic per-user bucket in PostgreSQL (public.consume_ai_rate_limit from 0078). */
export async function consumeVerificationResend(userId: string): Promise<boolean> {
  const rows = await getSql().unsafe<{ allowed: boolean }[]>(
    "select allowed from public.consume_ai_rate_limit('verify_email_resend', $1, $2, $3)",
    [userId, VERIFY_RESEND_LIMIT, VERIFY_RESEND_WINDOW_SECONDS]
  )
  return Boolean(rows[0]?.allowed)
}

export async function verifyEmailToken(token: unknown): Promise<boolean> {
  const consumed = await consumeEmailToken(pgEmailTokenStore, token, 'verify_email')
  if (!consumed) return false
  const rows = await getSql().unsafe<{ id: string }[]>(
    'select id::text as id from auth.users where id = $1::uuid and lower(email) = $2 and deleted_at is null',
    [consumed.userId, consumed.email]
  )
  if (!rows[0]) return false
  await markEmailVerified(consumed.userId)
  await logSecurityEvent({ event: 'email_verified', userId: consumed.userId })
  return true
}
