import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next.js 16 renamed Middleware to Proxy (same behavior).
 * Refreshes the Supabase session cookies and guards the dashboard routes.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * كل المسارات ما عدا:
     * - api (الwebhooks تعمل بدون جلسة: تستخدم مفاتيح الخدمة الخاصة بها)
     * - _next/static و _next/image و favicon وmanifest وicons وملفات الأصول
     * حتى لا يُشغَّل منطق الجلسة على ملفات ثابتة أو على نداءات مزوّدي القنوات.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
