import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'

/** Routes that require a signed-in user. */
const PROTECTED_PREFIXES = ['/dashboard', '/settings']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // لا يوجد مزوّد مصادقة مُهيّأ (متغيرات البيئة غير مضبوطة): لا شيء لتحديثه،
  // والسماح بمرور الطلبات حتى تظهر الصفحة العامة بدل أن يفشل الطلب بالكامل.
  const env = getSupabaseEnv()
  if (!env) {
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
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (isProtectedRoute && !user) {
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
