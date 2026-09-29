import type { SupabaseClient } from '@supabase/supabase-js'

export type ChannelHealth = {
  id: string
  channelType: string
  isActive: boolean
  verificationStatus: string | null
  providerAccountId: string | null
  externalIdentifier: string | null
  hasCredentials: boolean
  lastOutboundError: string | null
  status: 'healthy' | 'degraded' | 'disconnected' | 'misconfigured'
}

export async function loadChannelHealth(
  supabase: SupabaseClient,
  organizationId: string
): Promise<ChannelHealth[]> {
  const { data: channels } = await supabase
    .from('channels')
    .select(
      'id, channel_type, is_active, verification_status, provider_account_id, external_identifier'
    )
    .eq('organization_id', organizationId)
    .order('channel_type')

  const { data: creds } = await supabase
    .from('provider_credentials')
    .select('id, provider, status, channel_id')
    .eq('organization_id', organizationId)

  const { data: recentFailures } = await supabase
    .from('outbox_events')
    .select('channel_id, last_error, status')
    .eq('organization_id', organizationId)
    .in('status', ['failed', 'dead_letter'])
    .order('updated_at', { ascending: false })
    .limit(50)

  const credByChannel = new Set(
    (creds ?? [])
      .filter((c) => c.status === 'active' && c.channel_id)
      .map((c) => c.channel_id as string)
  )
  // Also count org-level provider credentials without channel_id
  const hasOrgProviderCred = (creds ?? []).some(
    (c) => c.status === 'active' && !c.channel_id
  )

  const lastErrorByChannel = new Map<string, string>()
  for (const f of recentFailures ?? []) {
    if (f.channel_id && !lastErrorByChannel.has(f.channel_id)) {
      lastErrorByChannel.set(f.channel_id, String(f.last_error ?? f.status))
    }
  }

  return (channels ?? []).map((ch) => {
    const hasCredentials =
      credByChannel.has(ch.id) ||
      hasOrgProviderCred ||
      Boolean(ch.provider_account_id)
    const lastOutboundError = lastErrorByChannel.get(ch.id) ?? null

    let status: ChannelHealth['status'] = 'healthy'
    if (!ch.is_active || ch.verification_status === 'disconnected') {
      status = 'disconnected'
    } else if (!hasCredentials || ch.verification_status === 'failed') {
      status = 'misconfigured'
    } else if (lastOutboundError) {
      status = 'degraded'
    }

    return {
      id: ch.id,
      channelType: ch.channel_type,
      isActive: Boolean(ch.is_active),
      verificationStatus: ch.verification_status,
      providerAccountId: ch.provider_account_id,
      externalIdentifier: ch.external_identifier,
      hasCredentials,
      lastOutboundError,
      status,
    }
  })
}
