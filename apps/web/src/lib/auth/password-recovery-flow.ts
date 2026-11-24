/**
 * Password-reset request with no account enumeration: the caller always receives the
 * same message, whether the e-mail exists, delivery fails, or the address is unknown.
 */
import { issueEmailToken, type EmailTokenStore } from './email-tokens'

export const PASSWORD_RESET_GENERIC_MESSAGE =
  'إذا كان البريد مرتبطاً بحساب، فستصلك رسالة تحتوي على رابط إعادة التعيين خلال دقائق. تحقق من صندوق الوارد والرسائل غير المرغوب فيها.'

export type PasswordResetDeps = {
  store: EmailTokenStore
  findUserByEmail: (email: string) => Promise<{ id: string; email: string | null } | null>
  sendEmail: (to: string, resetUrl: string) => Promise<void>
  logEvent: (event: string, userId: string | null) => Promise<void>
  resetUrl: (token: string) => string
}

export async function requestPasswordReset(email: string, deps: PasswordResetDeps): Promise<{ message: string }> {
  const normalized = email.trim().toLowerCase()
  const generic = { message: PASSWORD_RESET_GENERIC_MESSAGE }
  try {
    const user = await deps.findUserByEmail(normalized)
    await deps.logEvent('password_reset_requested', user?.id ?? null)
    if (!user) return generic
    const token = await issueEmailToken(deps.store, { userId: user.id, email: normalized, type: 'reset_password' })
    try {
      await deps.sendEmail(normalized, deps.resetUrl(token))
    } catch (error) {
      // Undeliverable link must not stay usable.
      await deps.store.invalidateOpen(user.id, 'reset_password', new Date())
      await deps.logEvent('password_reset_delivery_failed', user.id)
      console.error('password_reset_delivery_failed', { reason: String((error as Error)?.message ?? '').slice(0, 120) })
    }
  } catch (error) {
    console.error('password_reset_request_failed', { reason: String((error as Error)?.message ?? '').slice(0, 120) })
  }
  return generic
}
