import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_SECONDS,
  sessionCookieOptions,
  signSession,
  verifySession,
} from '@/lib/auth/session'

/** Routes that require a signed-in user. */
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/settings']
/** Routes a signed-in user does not need to see again. */
const GUEST_ONLY = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const claims = await verifySession(token)

  if (!claims && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('returnTo', pathname)
    const response = NextResponse.redirect(url)
    if (token) response.cookies.delete(SESSION_COOKIE)
    return response
  }

  if (claims && GUEST_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next({ request })

  // Sliding expiry: re-issue the session once a day while the user is active.
  if (claims && Date.now() / 1000 - claims.iat > SESSION_REFRESH_AFTER_SECONDS) {
    const renewed = await signSession({ id: claims.sub, email: claims.email, sessionVersion: claims.sv })
    response.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions())
  }

  return response
}

export const config = {
  matcher: [
    // Everything except API routes (webhooks authenticate themselves) and static assets.
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
