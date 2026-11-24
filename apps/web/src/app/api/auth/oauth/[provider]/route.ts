import { NextResponse, type NextRequest } from 'next/server'
import { isAuthConfigured } from '@/lib/auth/config'
import { buildAuthorizationUrl, getOAuthProviderConfig, pkceChallenge } from '@/lib/auth/oauth/providers'
import { oauthCallbackUrl, oauthErrorRedirect, oauthBindingCookieOptions } from '@/lib/auth/oauth/http'
import { createOAuthState, isOAuthProvider, OAUTH_BINDING_COOKIE } from '@/lib/auth/oauth/state'

export const dynamic = 'force-dynamic'

/** Starts Google/Apple sign-in: seals state + nonce + PKCE and redirects to the provider. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  const mode = request.nextUrl.searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  if (!isAuthConfigured()) return oauthErrorRedirect(request, mode, 'unavailable', provider)
  const config = getOAuthProviderConfig(provider)
  if (!config) return oauthErrorRedirect(request, mode, 'not_configured', provider)

  const sealed = await createOAuthState({ provider, mode, returnTo: request.nextUrl.searchParams.get('returnTo') })
  const authorizeUrl = buildAuthorizationUrl(config, {
    state: sealed.state,
    nonce: sealed.nonce,
    codeChallenge: pkceChallenge(sealed.codeVerifier),
    redirectUri: oauthCallbackUrl(request, provider),
  })
  const response = NextResponse.redirect(authorizeUrl, { status: 302 })
  response.cookies.set(OAUTH_BINDING_COOKIE, sealed.binding, oauthBindingCookieOptions(provider))
  response.headers.set('Cache-Control', 'no-store')
  return response
}
