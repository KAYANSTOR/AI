import { NextRequest, NextResponse } from 'next/server'
import { verifyEmbeddedSignupOAuthState } from '@/lib/channels/embedded-signup'
import { canManageMetaChannels, MetaLinkError, type MetaLinkStatus } from '@/lib/channels/meta-connection'
import { completeMetaSocialLink } from '@/lib/channels/meta-social'
import { getCurrentOrg } from '@/lib/org'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  function respond(status: MetaLinkStatus) {
    const target = new URL('/dashboard/channels', request.url)
    target.searchParams.set('status', status)
    const response = NextResponse.redirect(target)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  try {
    const org = await getCurrentOrg()
    if (!org || !canManageMetaChannels(org.role)) return respond('meta_forbidden')

    const params = request.nextUrl.searchParams
    const state = await verifyEmbeddedSignupOAuthState(params.get('state') ?? '', org.organizationId, undefined, 'instagram')
    if (state?.social?.channel !== 'instagram') return respond('meta_expired')
    if (params.get('error_reason') === 'user_denied' || params.get('error') === 'access_denied') {
      return respond('meta_cancelled')
    }
    const code = params.get('code')?.trim()
    if (params.has('error')) return respond('meta_permission')
    if (!code || code.length > 4096) return respond('meta_error')

    await completeMetaSocialLink({
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      target: state.social,
      code,
      redirectUri: state.redirectUri,
    })
    return respond('meta_success')
  } catch (error) {
    if (error instanceof MetaLinkError) return respond(error.status)
    console.error('Meta social callback failed', { errorType: error instanceof Error ? error.name : 'unknown' })
    return respond('meta_error')
  }
}
