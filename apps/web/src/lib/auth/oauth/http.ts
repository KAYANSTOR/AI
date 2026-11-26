import { NextResponse, type NextRequest } from 'next/server'
import { isSiteUrlConfigured, siteUrl } from '../site-url'
import type { OAuthErrorCode } from './messages'
import { OAUTH_STATE_TTL_SECONDS, type OAuthMode, type OAuthProvider } from './state'

function absolute(request: NextRequest, pathname: string): string {
  // Production links come from configuration, never from the Host header.
  return isSiteUrlConfigured() ? siteUrl(pathname) : new URL(pathname, request.nextUrl.origin).toString()
}

export function oauthCallbackUrl(request: NextRequest, provider: OAuthProvider): string {
  return absolute(request, `/api/auth/oauth/${provider}/callback`)
}

export function oauthErrorRedirect(request: NextRequest, mode: OAuthMode, code: OAuthErrorCode, provider: OAuthProvider): NextResponse {
  const url = new URL(absolute(request, mode === 'signup' ? '/signup' : '/login'))
  url.searchParams.set('oauthError', code)
  url.searchParams.set('provider', provider)
  return NextResponse.redirect(url, { status: 303 })
}

export function absoluteUrl(request: NextRequest, pathname: string): string {
  return absolute(request, pathname)
}

export function oauthBindingCookieOptions(_provider: OAuthProvider) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth/oauth',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  }
}
