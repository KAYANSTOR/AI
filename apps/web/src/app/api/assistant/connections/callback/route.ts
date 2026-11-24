import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
  getGoogleOAuthConfig,
  saveConnection,
  verifyConnectorState,
} from '@/lib/connectors/service'
import type { ConnectorProvider } from '@/lib/connectors/types'
import { appBaseUrl } from '@/lib/central-bot/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectTo(params: Record<string, string>): NextResponse {
  const base = appBaseUrl()
  const url = new URL(base + '/dashboard/assistant')
  url.searchParams.set('tab', 'tools')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

function redirectUri(request: Request): string {
  const base = appBaseUrl() || new URL(request.url).origin
  return base.replace(/\/+$/, '') + '/api/assistant/connections/callback'
}

/**
 * Google OAuth callback. The signed state binds the code to the owner who started the
 * flow: a callback for another session is refused, so one tenant can never attach
 * another tenant's mailbox.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('error')) return redirectTo({ connect: 'denied' })

  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access

  const code = url.searchParams.get('code') ?? ''
  const state = verifyConnectorState(url.searchParams.get('state') ?? '')
  if (!code || !state) return redirectTo({ connect: 'invalid_state' })
  if (state.organizationId !== access.owner.organizationId || state.userId !== access.owner.userId) {
    return redirectTo({ connect: 'invalid_state' })
  }
  if (!getGoogleOAuthConfig()) return redirectTo({ connect: 'not_configured' })

  try {
    const tokens = await exchangeGoogleCode({ code, redirectUri: redirectUri(request) })
    const accountEmail = await fetchGoogleAccountEmail(tokens)
    await saveConnection(access.admin, access.owner, {
      provider: state.provider as ConnectorProvider,
      tokens,
      accountEmail,
    })
    await access.admin.from('audit_events').insert({
      organization_id: access.owner.organizationId,
      actor_type: 'user',
      actor_id: access.owner.userId,
      action: 'connector.connected',
      entity_type: 'user_tool_connection',
      entity_id: null,
      metadata: { provider: state.provider, account_email: accountEmail },
    })
    return redirectTo({ connect: 'success', provider: state.provider })
  } catch {
    return redirectTo({ connect: 'failed', provider: state.provider })
  }
}
