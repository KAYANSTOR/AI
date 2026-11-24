import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import {
  buildConnectorAuthorizeUrl,
  connectorStateTtl,
  disconnectConnection,
  getGoogleOAuthConfig,
  listConnections,
  signConnectorState,
} from '@/lib/connectors/service'
import { isConnectorProvider, type ConnectorProvider } from '@/lib/connectors/types'
import { appBaseUrl } from '@/lib/central-bot/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectUri(request: Request): string {
  const base = appBaseUrl() || new URL(request.url).origin
  return base.replace(/\/+$/, '') + '/api/assistant/connections/callback'
}

export async function GET() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    const connections = await listConnections(access.db, access.owner)
    return NextResponse.json(
      { connections, googleConfigured: getGoogleOAuthConfig() !== null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ error: 'connections_list_failed' }, { status: 500 })
  }
}

/** Starts the Google OAuth flow; returns the authorize URL for this owner only. */
export async function POST(request: Request) {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const provider = body?.provider
  if (!isConnectorProvider(provider)) return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
  if (!getGoogleOAuthConfig()) return NextResponse.json({ error: 'google_connector_not_configured' }, { status: 503 })

  try {
    const state = signConnectorState({
      organizationId: access.owner.organizationId,
      userId: access.owner.userId,
      provider: provider as ConnectorProvider,
      exp: connectorStateTtl(),
    })
    const authorizeUrl = buildConnectorAuthorizeUrl({ provider, state, redirectUri: redirectUri(request) })
    return NextResponse.json({ authorizeUrl }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'connector_authorize_failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const provider = new URL(request.url).searchParams.get('provider')
  if (!isConnectorProvider(provider)) return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
  try {
    const disconnected = await disconnectConnection(access.admin, access.owner, provider)
    if (!disconnected) return NextResponse.json({ error: 'connection_not_found' }, { status: 404 })
    await access.admin.from('audit_events').insert({
      organization_id: access.owner.organizationId,
      actor_type: 'user',
      actor_id: access.owner.userId,
      action: 'connector.disconnected',
      entity_type: 'user_tool_connection',
      entity_id: null,
      metadata: { provider },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'connector_disconnect_failed' }, { status: 500 })
  }
}
