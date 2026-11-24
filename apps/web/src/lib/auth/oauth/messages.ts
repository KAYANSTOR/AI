import type { OAuthProvider } from './state'

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', apple: 'Apple' }

export const OAUTH_ERROR_CODES = ['not_configured', 'unavailable', 'invalid_state', 'cancelled', 'exchange_failed', 'email_unverified', 'suspended', 'failed'] as const
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number]

export function oauthErrorMessage(code: unknown, provider?: unknown): string | null {
  const label = provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : 'المزوّد'
  switch (code) {
    case 'not_configured': return `تسجيل الدخول عبر ${label} غير مفعّل بعد على هذه المنصة. استخدم البريد الإلكتروني أو رقم الهاتف مؤقتاً.`
    case 'unavailable': return 'خدمة الحسابات غير مهيأة حالياً. حاول لاحقاً.'
    case 'invalid_state': return 'انتهت صلاحية محاولة الدخول أو تعذّر التحقق منها لحمايتك. حاول مرة أخرى.'
    case 'cancelled': return `تم إلغاء الدخول عبر ${label}.`
    case 'exchange_failed': return `تعذّر التحقق من حسابك لدى ${label}. حاول مرة أخرى.`
    case 'email_unverified': return `بريدك لدى ${label} غير مؤكد، لذلك لا يمكن ربطه بحساب. أكّد بريدك لدى ${label} أو سجّل بالبريد وكلمة المرور.`
    case 'suspended': return 'هذا الحساب موقوف مؤقتاً. تواصل مع الدعم.'
    case 'failed': return 'حدث خطأ غير متوقع أثناء الدخول. حاول مرة أخرى.'
    default: return null
  }
}
