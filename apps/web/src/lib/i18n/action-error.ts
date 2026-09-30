import { ar } from './ar'

function messageFrom(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return ''
}

export function actionErrorMessage(error: unknown, fallback: string = ar.errors.generic) {
  const message = messageFrom(error)
  if (/[\u0600-\u06ff]/i.test(message)) return message
  console.error('Server action failed', error)
  return fallback
}

/** Prefer Arabic operator messages; keep short code hints for debugging. */
export function supabaseActionError(error: unknown, fallback: string = ar.errors.generic) {
  console.error('Supabase server action failed', error)
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : ''
  const message = messageFrom(error)

  if (code === '23503') {
    return 'مرجع مرتبط غير موجود (تحقق من إعداد النشاط/القناة).'
  }
  if (code === '23505') {
    return 'هذا المعرّف مستخدم بالفعل لشركة أخرى.'
  }
  if (code === '42501') {
    return 'لا تملك صلاحية تنفيذ هذه العملية على قاعدة البيانات.'
  }
  if (code === '42P01') {
    return 'جدول مطلوب غير موجود. تأكد من تطبيق migrations.'
  }
  if (code === 'PGRST202' || /function .* does not exist/i.test(message)) {
    return 'دالة قاعدة البيانات غير موجودة. طبّق migrations الناقصة.'
  }
  if (/[\u0600-\u06ff]/i.test(message)) return message
  if (code) return `${fallback} (${code})`
  return fallback
}
