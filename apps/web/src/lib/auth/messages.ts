/**
 * رسائل المصادقة بالعربية.
 * نترجم الأخطاء المعروفة من Supabase Auth، ونُبقي نص الخطأ الأصلي لأي حالة غير معروفة
 * بدل اختراع رسالة مضلّلة.
 */
const KNOWN_MESSAGES: ReadonlyArray<{ match: RegExp; message: string }> = [
  { match: /invalid login credentials/i, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' },
  { match: /email not confirmed/i, message: 'لم يتم تأكيد بريدك الإلكتروني بعد. راجع رسائل بريدك.' },
  { match: /user already registered/i, message: 'هذا البريد مسجّل بالفعل. جرّب تسجيل الدخول.' },
  { match: /password should be at least/i, message: 'كلمة المرور قصيرة: يجب أن تكون 6 أحرف على الأقل.' },
  { match: /unable to validate email address|invalid email/i, message: 'صيغة البريد الإلكتروني غير صحيحة.' },
  { match: /email rate limit exceeded|over_email_send_rate_limit/i, message: 'تم إرسال عدة رسائل. جرّب مرة أخرى بعد قليل.' },
]

const FALLBACK = 'تعذّر إتمام العملية. تأكّد من بياناتك وحاول مرة أخرى.'

export function translateAuthError(message: string | undefined): string {
  if (!message) return FALLBACK
  const known = KNOWN_MESSAGES.find((entry) => entry.match.test(message))
  return known?.message ?? message
}

export const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بخدمة الحسابات. تحقّق من اتصالك ثم حاول مرة أخرى.'
