import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CHANNEL_SPECS, getChannelSpec, type ChannelType } from '@/lib/channels/management'
import { credentialsStorageConfigured, listCredentialMetadata } from '@/lib/credentials/service'
import { PROVIDER_FOR_CHANNEL, type CredentialMetadata } from '@/lib/credentials/catalog'
import { ChannelCard, type ChannelCardData } from './channel-card'
import { PhonePanel } from './phone-panel'
import { ar } from '@/lib/i18n/ar'
import { formatNumber } from '@/lib/i18n/format'

export const dynamic = 'force-dynamic'

type ChannelRow = {
  id: string
  channel_type: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

export default async function ChannelsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'
  const storageConfigured = credentialsStorageConfigured()

  // Isolate each query so a missing table/RLS error never blanks the whole screen.
  let rows: ChannelRow[] = []
  let channelsError: string | null = null
  try {
    const result = await supabase
      .from('channels')
      .select('id, channel_type, provider_account_id, external_identifier, verification_status, is_active')
      .eq('organization_id', context.organizationId)
    if (result.error) {
      channelsError = result.error.message
      console.error('Unable to load channels', result.error)
    } else {
      rows = (result.data ?? []) as ChannelRow[]
    }
  } catch (error) {
    channelsError = error instanceof Error ? error.message : 'channels_load_failed'
    console.error('Unable to load channels', error)
  }

  let businessName: string | null = context.organizationName
  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', context.organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (business?.name) businessName = business.name as string
  } catch (error) {
    console.error('Unable to load business summary', error)
  }

  let phoneConnection: {
    existing_phone_number: string | null
    internal_vapi_number: string | null
    forward_type: string | null
    forwarding_status: string | null
    last_verified_at: string | null
  } | null = null
  try {
    const { data } = await supabase
      .from('phone_connections')
      .select('existing_phone_number, internal_vapi_number, forward_type, forwarding_status, last_verified_at')
      .eq('organization_id', context.organizationId)
      .maybeSingle()
    phoneConnection = data
  } catch (error) {
    console.error('Unable to load phone connection', error)
  }

  let credentialMetadata: CredentialMetadata[] = []
  if (canManage) {
    try {
      credentialMetadata = await listCredentialMetadata(supabase, context.organizationId)
    } catch (credentialError) {
      console.error('Unable to load channel credential metadata', credentialError)
      credentialMetadata = []
    }
  }

  const credentialsFor = (type: ChannelType) =>
    credentialMetadata.filter((entry) => entry.provider === PROVIDER_FOR_CHANNEL[type])

  const byType = new Map(rows.map((row) => [row.channel_type, row]))

  const cards: ChannelCardData[] = CHANNEL_SPECS.map((spec) => {
    const row = byType.get(spec.type)
    return {
      spec,
      timezone: context.timezone,
      identifier: row?.provider_account_id ?? row?.external_identifier ?? null,
      publicNumber: spec.publicNumberLabel ? (row?.external_identifier ?? null) : null,
      isActive: row?.is_active === true,
      connected: Boolean(row?.id),
      verificationStatus: row?.verification_status ?? null,
      credentials: credentialsFor(spec.type),
      credentialsStorageConfigured: storageConfigured,
      canManage,
    }
  })

  const activeCount = cards.filter((card) => card.connected && card.isActive).length
  const phoneSpec = getChannelSpec('phone')

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
        <p className="text-sm text-text-muted">{ar.channelPage.description}</p>
      </header>

      {!canManage && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          {ar.channelPage.adminOnly}
        </p>
      )}

      {channelsError && (
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          {ar.errors.load}
          <span className="mt-1 block text-xs text-text-muted">{channelsError}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label={ar.channels.enabled} value={formatNumber(activeCount)} />
        <SummaryTile
          label={ar.channels.connected}
          value={formatNumber(cards.filter((card) => card.connected).length)}
        />
        <SummaryTile label={ar.channels.activity} value={businessName ?? ar.common.notSet} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text">
        <Info size={16} className="mt-0.5 shrink-0 text-primary-dark" aria-hidden="true" />
        <span>
          {ar.channelPage.secretNoticeBefore}{' '}
          <strong>{ar.channelPage.secretNoticeStrong}</strong> {ar.channelPage.secretNoticeAfter}
        </span>
      </p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {cards.map((card) => (
          <ChannelCard key={card.spec.type} data={card} channelType={card.spec.type} />
        ))}
      </div>

      <PhonePanel
        canManage={canManage}
        timezone={context.timezone}
        instructions={phoneSpec?.setup ?? []}
        initial={
          phoneConnection
            ? {
                existingPhoneNumber: phoneConnection.existing_phone_number ?? null,
                vapiNumber: phoneConnection.internal_vapi_number ?? null,
                forwardType: phoneConnection.forward_type ?? 'no_answer',
                forwardingStatus: phoneConnection.forwarding_status ?? 'pending_test',
                lastVerifiedAt: phoneConnection.last_verified_at ?? null,
              }
            : null
        }
      />
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tracking-tight text-text">{value}</p>
    </div>
  )
}
