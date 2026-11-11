import { NextRequest, NextResponse } from 'next/server'
import { completeWhatsAppEmbeddedSignupAction } from '@/app/onboarding/embedded-signup-actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SessionInfo = {
  phone_number_id?: string
  waba_id?: string
  business_id?: string
}

function parseSessionInfo(value: string | null): SessionInfo {
  if (!value) return {}
  // URLSearchParams already decodes query values once. Parse that value first;
  // only try a second decode for Meta/browser variants that double-encode JSON.
  for (const candidate of [value, safeDecode(value)]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate) as SessionInfo
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Try the next representation.
    }
  }
  return {}
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function redirectToChannels(request: NextRequest, status: 'meta_success' | 'meta_error') {
  const url = new URL('/dashboard/channels', request.url)
  url.searchParams.set('status', status)
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

/**
 * Mobile fallback for Meta Embedded Signup. FB.login may navigate instead of
 * opening a popup, so the parent page cannot receive postMessage. The server
 * can complete the exchange with the code and derive missing resource IDs.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')?.trim()
  const session = parseSessionInfo(params.get('session_info') ?? params.get('sessionInfo'))
  const phoneNumberId = session.phone_number_id ?? params.get('phone_number_id')
  const wabaId = session.waba_id ?? params.get('waba_id')
  const businessPortfolioId = session.business_id ?? params.get('business_id')

  if (!code || params.get('error')) return redirectToChannels(request, 'meta_error')

  try {
    const result = await completeWhatsAppEmbeddedSignupAction({
      code,
      phoneNumberId: phoneNumberId ?? null,
      wabaId: wabaId ?? null,
      businessPortfolioId: businessPortfolioId ?? null,
    })

    if (!result.ok) {
      console.warn('Meta embedded signup callback was not completed', {
        reason: result.error ?? 'unknown',
        hasPhoneNumberId: Boolean(phoneNumberId),
        hasWabaId: Boolean(wabaId),
        hasBusinessPortfolioId: Boolean(businessPortfolioId),
      })
    }
    return redirectToChannels(request, result.ok ? 'meta_success' : 'meta_error')
  } catch (error) {
    console.error('Meta embedded signup callback failed unexpectedly', error)
    return redirectToChannels(request, 'meta_error')
  }
}
