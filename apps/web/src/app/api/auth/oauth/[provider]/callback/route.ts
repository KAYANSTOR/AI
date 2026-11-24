import { NextResponse, type NextRequest } from 'next/server'
import { isAuthConfigured } from '@/lib/auth/config'
import { resolveOAuthAccount } from '@/lib/auth/oauth/account'
import { absoluteUrl, oauthErrorRedirect } from '@/lib/auth/oauth/http'
import { exchangeAuthorizationCode, getOAuthProviderConfig, verifyIdToken } from '@/lib/auth/oauth/providers'
import { oauthAccountDeps } from '@/lib/auth/oauth/service'
import { oauthCallbackUrl } from '@/lib/auth/oauth/http'
import { isOAuthProvider, OAUTH_BINDING_COOKIE, readOAuthState, type OAuthProvider } from '@/lib/auth/oauth/state'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth/session'
import { recordSignIn } from '@/lib/auth/users'

export const dynamic = 'force-dynamic'

type CallbackParams = { code: string | null; state: string | null; error: string | null }

async function handle(request: NextRequest, provider: string, input: CallbackParams) {
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  const p: OAuthProvider = provider
  const binding = request.cookies.get(OAUTH_BINDING_COOKIE)?.value
  const fail = (code: Parameters<typeof oauthErrorRedirect>[2], mode: 'login' | 'signup' = 'login') => {
    const response = oauthErrorRedirect(request, mode, code, p)
    response.cookies.delete({ name: OAUTH_BINDING_COOKIE, path: '/api/auth/oauth' })
    return response
  }

  if (!isAuthConfigured()) return fail('unavailable')
  const config = getOAuthProviderConfig(p)
  if (!config) return fail('not_configured')

  const state = await readOAuthState(input.state, binding, p)
  if (!state) return fail('invalid_state')
  if (input.error) return fail(input.error === 'access_denied' || input.error === 'user_cancelled_authorize' ? 'cancelled' : 'exchange_failed', state.mode)
  if (!input.code) return fail('invalid_state', state.mode)

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  try {
    const idToken = await exchangeAuthorizationCode(config, { code: input.code, codeVerifier: state.codeVerifier, redirectUri: oauthCallbackUrl(request, p) })
    const profile = idToken ? await verifyIdToken(config, idToken, state.nonce) : null
    if (!profile) return fail('exchange_failed', state.mode)

    const result = await resolveOAuthAccount(profile, oauthAccountDeps(ip))
    if (result.kind === 'error') return fail(result.code, state.mode)

    const destination = result.kind === 'created' ? '/onboarding' : state.returnTo
    const response = NextResponse.redirect(absoluteUrl(request, destination), { status: 303 })
    response.cookies.set(SESSION_COOKIE, await signSession(result.user), sessionCookieOptions())
    response.cookies.delete({ name: OAUTH_BINDING_COOKIE, path: '/api/auth/oauth' })
    response.headers.set('Cache-Control', 'no-store')
    await recordSignIn(result.user.id).catch(() => undefined)
    return response
  } catch (error) {
    console.error('oauth_callback_failed', { provider: p, reason: String((error as Error)?.message ?? '').slice(0, 160) })
    return fail('failed', state.mode)
  }
}

/** Google returns with a GET redirect. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const q = request.nextUrl.searchParams
  return handle(request, provider, { code: q.get('code'), state: q.get('state'), error: q.get('error') })
}

/** Apple returns with response_mode=form_post. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const form = await request.formData().catch(() => null)
  const read = (key: string) => {
    const value = form?.get(key)
    return typeof value === 'string' ? value : null
  }
  return handle(request, provider, { code: read('code'), state: read('state'), error: read('error') })
}
