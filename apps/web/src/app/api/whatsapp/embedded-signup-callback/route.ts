import { NextRequest, NextResponse } from 'next/server'
import { completeWhatsAppEmbeddedSignupAction } from '@/app/onboarding/embedded-signup-actions'

type SessionInfo = {
  phone_number_id?: string
  waba_id?: string
  business_id?: string
}

function parseSessionInfo(value: string | null): SessionInfo {
  if (!value) return {}
  try {
    const decoded = decodeURIComponent(value)
    const parsed = JSON.parse(decoded) as SessionInfo
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function redirectToChannels(request: NextRequest, status: 'meta_success' | 'meta_error') {
  const url = new URL('/dashboard/channels', request.url)
  url.searchParams.set('status', status)
  return NextResponse.redirect(url)
}

/**
 * Mobile fallback for Meta Embedded Signup. FB.login may navigate instead of
 * opening a popup, so the parent page cannot receive postMessage. The server
 * can complete the exchange with the code and derive missing resource IDs.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')?.trim()
  const session = parseSessionInfo(params.get('session_info'))

  if (!code || params.get('error')) return redirectToChannels(request, 'meta_error')

  const result = await completeWhatsAppEmbeddedSignupAction({
    code,
    phoneNumberId: session.phone_number_id ?? null,
    wabaId: session.waba_id ?? null,
    businessPortfolioId: session.business_id ?? null,
  })

  return redirectToChannels(request, result.ok ? 'meta_success' : 'meta_error')
}
