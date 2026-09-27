/**
 * إعدادات الاتصال بمزوّد المصادقة/قاعدة البيانات (Supabase).
 *
 * كل الأماكن التي تبني عميل Supabase تمر من هنا، حتى لا يتكرر فحص متغيرات البيئة،
 * ويمكن للصفحات العامة أن تخبر الزائر بوضوح عندما لم تُضبط مفاتيح المشروع بعد
 * بدل أن تسقط بخطأ غير مفهوم.
 *
 * المفاتيح المطلوبة (تُضاف من إعدادات البيئة، ولا تُكتب في الكود):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export type SupabaseEnv = {
  url: string
  anonKey: string
}

const MISSING_ENV_MESSAGE =
  'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return null

  return { url, anonKey }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null
}

/** Reads the settings or throws — used by code paths that cannot work without them. */
export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv()
  if (!env) throw new Error(MISSING_ENV_MESSAGE)
  return env
}
