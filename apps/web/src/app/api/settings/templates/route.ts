import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/server'
import { createAdminClient } from '@/lib/db/admin'
import { getDashboardContext } from '@/lib/dashboard/context'
import { resolveChannelProviderCredentials } from '@/lib/credentials/resolve'
import { CredentialConfigError, CredentialMissingError, requireCredential } from '@/lib/credentials/service'
import {
  findApprovedTemplate,
  submitWhatsAppTemplate,
  syncWhatsAppTemplates,
} from '@/lib/channels/whatsapp-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function whatsappChannel(organizationId: string, channelId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('channels')
    .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier, connection_mode, is_active')
    .eq('id', channelId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error('channel_lookup_failed')
  return data
}

export async function GET() {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = await createClient()
  const admin = createAdminClient()

  const [channelsResult, templatesResult] = await Promise.all([
    db
      .from('channels')
      .select('id, channel_type, external_identifier, connection_mode, is_active')
      .eq('organization_id', context.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    admin
      .from('whatsapp_message_templates')
      .select(
        'id, channel_id, meta_template_id, template_name, language_code, category, body_text, variables_schema, status, rejection_reason, last_synced_at, updated_at'
      )
      .eq('org_id', context.organizationId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ])

  if (channelsResult.error || templatesResult.error) {
    return NextResponse.json({ error: 'templates_load_failed' }, { status: 500 })
  }
  const channels = (channelsResult.data ?? []).filter((channel) => channel.connection_mode !== 'qr_unofficial')
  const approved = channels.length
    ? await findApprovedTemplate(admin, { organizationId: context.organizationId, channelId: String(channels[0].id) })
    : null

  return NextResponse.json(
    {
      channels,
      templates: templatesResult.data ?? [],
      hasApprovedTemplate: Boolean(approved),
      canManage: context.role !== 'read_only',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(request: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (context.role === 'read_only') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  const channelId = typeof body.channelId === 'string' ? body.channelId : ''
  const action = body.action === 'sync' || body.action === 'create' ? body.action : null
  if (!channelId || !action) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  try {
    const channel = await whatsappChannel(context.organizationId, channelId)
    if (!channel) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })
    if (channel.channel_type !== 'whatsapp' || channel.connection_mode === 'qr_unofficial') {
      return NextResponse.json({ error: 'whatsapp_cloud_api_required' }, { status: 422 })
    }

    const admin = createAdminClient()
    const credentials = await resolveChannelProviderCredentials(admin, {
      channelId: String(channel.id),
      channelType: 'whatsapp',
    })
    const accessToken = requireCredential(credentials, 'meta', 'access_token')
    const wabaId = requireCredential(credentials, 'meta', 'business_account_id')

    const result =
      action === 'sync'
        ? await syncWhatsAppTemplates(admin, {
            organizationId: context.organizationId,
            channelId: String(channel.id),
            wabaId,
            accessToken,
          })
        : await submitWhatsAppTemplate(admin, {
            organizationId: context.organizationId,
            channelId: String(channel.id),
            wabaId,
            accessToken,
            name: typeof body.name === 'string' ? body.name : '',
            languageCode: typeof body.languageCode === 'string' ? body.languageCode : 'ar',
            category: typeof body.category === 'string' ? body.category : 'UTILITY',
            bodyText: typeof body.bodyText === 'string' ? body.bodyText : '',
            examples: Array.isArray(body.examples) ? body.examples.map((value) => String(value)) : [],
          })

    await admin.from('audit_events').insert({
      organization_id: context.organizationId,
      actor_type: 'user',
      actor_id: context.userId,
      action: action === 'sync' ? 'whatsapp.templates_synced' : 'whatsapp.template_submitted',
      entity_type: 'whatsapp_message_template',
      entity_id: null,
      metadata: { channel_id: channel.id, ...(result as Record<string, unknown>) },
    })

    return NextResponse.json({ ok: true, action, result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof CredentialMissingError || error instanceof CredentialConfigError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    const message = error instanceof Error ? error.message : ''
    if (/^invalid_|^template_examples_required/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (error instanceof Error && error.name === 'MetaApiError') {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    return NextResponse.json({ error: 'template_action_failed' }, { status: 500 })
  }
}
