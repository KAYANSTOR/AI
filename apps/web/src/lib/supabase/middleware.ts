import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'

/** Routes that require a signed-in user. */
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/settings']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname } = request.nextUrl
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  // لا يوجد مزوّد مصادقة مُهيّأ (متغيرات البيئة غير مضبوطة): لا يمكن التحقق من أي جلسة،
  // لذلك لا تُعرض المسارات المحمية إطلاقًا — الفشل هنا يجب أن يكون مغلقًا لا مفتوحًا.
  // الصفحات العامة تمر كما هي حتى تعرض سبب عدم التهيئة بدل أن تفشل بالكامل.
  const env = getSupabaseEnv()
  if (!env) {
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      url.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (isProtectedRoute && !claims?.sub) {
    // Send the visitor to /login and keep the page they wanted, so the app
    // returns them there right after signing in.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
