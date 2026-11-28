import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { isPersonalWorkspace } from '@/lib/dashboard/navigation-policy'
import { CHANNEL_SPECS } from '@/lib/channels/management'
import { ChannelsConsole } from './channels-console'
import { OwnerPresencePanel, type OwnerPresenceChannel } from './owner-presence-panel'
import { normalizeSettings } from '@/lib/runtime/owner-presence'
import { ar } from '@/lib/i18n/ar'
import { databaseErrorMessage, logDatabaseError } from '@/lib/db/errors'
import { canManageMetaChannels, META_LINK_NOTICES, type MetaLinkStatus } from '@/lib/channels/meta-connection'

export const dynamic = 'force-dynamic'

type ChannelRow = {
  id: string
  channel_type: string
  external_identifier: string | null
  provider_account_id: string | null
  verification_status: string | null
  is_active: boolean | null
  connection_mode: string | null
}


export default async function ChannelsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const status = (await searchParams)?.status
  const linkNotice = status && Object.prototype.hasOwnProperty.call(META_LINK_NOTICES, status)
    ? META_LINK_NOTICES[status as MetaLinkStatus]
    : null

  const db = await createClient()
  const canManage = canManageMetaChannels(context.role)
  const personal = isPersonalWorkspace(context)

  let rows: ChannelRow[] = []
  let channelsError: string | null = null
  try {
    const result = await db
      .from('channels')
      .select('id, channel_type, external_identifier, provider_account_id, verification_status, is_active, connection_mode')
      .eq('organization_id', context.organizationId)

    if (result.error) {
      logDatabaseError('channels page: load channels', result.error)
      channelsError = databaseErrorMessage(result.error, ar.errors.load)
    } else {
      rows = (result.data ?? []) as ChannelRow[]
    }
  } catch (error) {
    logDatabaseError('channels page: load channels', error)
    channelsError = databaseErrorMessage(error, ar.errors.load)
  }

  // WhatsApp has three independently managed connection modes. Legacy rows without
  // a mode are treated as the standard Cloud API connection.
  const whatsappModes = [
    { key: 'whatsapp-business-app', connectionMode: 'coexistence', label: 'واتساب للأعمال · التعايش', provider: 'ميتا', description: 'اربط الرقم مع الاستمرار في استخدام تطبيق واتساب للأعمال على الهاتف.' },
    { key: 'whatsapp-meta-api', connectionMode: 'cloud_api', label: 'واتساب للأعمال · الربط السحابي', provider: 'ميتا', description: 'اربط رقمًا بخدمة واتساب السحابية وقدّم رمز التحقق بخطوتين عند طلبه.' },
    { key: 'whatsapp-qr', connectionMode: 'qr_unofficial', label: 'واتساب عبر رمز المسح أو رقم الهاتف', provider: 'واتساب ويب', description: 'اربط حساب واتساب من هاتفك بمسح الرمز أو إدخال رمز الربط الذي يولّده رقم الهاتف.' },
  ] as const

  const whatsappCards = whatsappModes.map((mode) => {
    const exactRow = rows.find((row) =>
      row.channel_type === 'whatsapp' && row.connection_mode === mode.connectionMode
    )
    const row = exactRow ?? (mode.connectionMode === 'cloud_api'
      ? rows.find((item) => item.channel_type === 'whatsapp' && !item.connection_mode)
      : undefined)
    return {
      key: mode.key,
      type: 'whatsapp' as const,
      label: mode.label,
      provider: mode.provider,
      description: mode.description,
      publicNumberLabel: 'رقم واتساب',
      publicNumber: row?.external_identifier ?? null,
      identifier: row?.provider_account_id ?? null,
      // OPS-002: a database row is not proof of a live WhatsApp session. The QR card
      // is only "connected" when the gateway reconciled the channel to verified+active;
      // a skipped/unregistered restore now also clears both flags server-side.
      connected: mode.connectionMode === 'qr_unofficial'
        ? row?.verification_status === 'verified' && row?.is_active === true
        : Boolean(row?.id),
      verificationStatus: row?.verification_status ?? null,
      isActive: row?.is_active === true,
      connectionMode: mode.connectionMode,
    }
  })

  const otherCards = CHANNEL_SPECS.filter((spec) => spec.type !== 'whatsapp').map((spec) => {
    const row = rows.find((item) => item.channel_type === spec.type)
    return {
      key: spec.type,
      type: spec.type,
      label: spec.label,
      provider: spec.provider,
      description: spec.bindingHint,
      publicNumberLabel: spec.publicNumberLabel,
      publicNumber: row?.external_identifier ?? null,
      identifier: row?.provider_account_id ?? (spec.bindingColumn === 'external_identifier' ? row?.external_identifier : null),
      connected: Boolean(row?.id),
      verificationStatus: row?.verification_status ?? null,
      isActive: row?.is_active === true,
      connectionMode: row?.connection_mode ?? null,
    }
  })

  const cards = [...whatsappCards, ...otherCards]

  // Owner-presence settings live in their own query so the page still renders
  // if the columns are not migrated yet.
  let presenceChannels: OwnerPresenceChannel[] = []
  try {
    const presence = await db
      .from('channels')
      .select('id, external_identifier, connection_mode, human_takeover_enabled, human_takeover_pause_minutes, human_takeover_scope, human_paused_until')
      .eq('organization_id', context.organizationId)
      .eq('channel_type', 'whatsapp')
    if (presence.error) logDatabaseError('channels page: load owner presence', presence.error)
    presenceChannels = (presence.data ?? []).map((row) => {
      const settings = normalizeSettings(row)
      const mode = whatsappModes.find((item) => item.connectionMode === row.connection_mode)
      return {
        id: String(row.id),
        label: [mode?.label ?? 'واتساب', row.external_identifier].filter(Boolean).join(' · '),
        enabled: settings.enabled,
        pauseMinutes: settings.pauseMinutes,
        scope: settings.scope,
        pausedNow: isPausedNow(row.human_paused_until),
      }
    })
  } catch (error) {
    logDatabaseError('channels page: load owner presence', error)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4 rounded-[1.15rem] border border-border bg-background/55 p-5 sm:p-6">
        <div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            {personal
              ? 'اربط رقم واتساب الخاص بك وحسابات الرسائل التي تديرها من مكان واحد.'
              : 'اربط قنوات التواصل التي يستخدمها عملاؤك، وأدر حالة كل قناة من مكان واحد.'}
          </p>
        </div>

      </header>

      {!canManage && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-6 text-text">
          أنت في وضع الاطلاع فقط. يستطيع المالك أو المسؤول ربط القنوات أو تعديلها.
        </p>
      )}

      {channelsError && (
        <div className="space-y-2">
          <Notice tone="error" message={channelsError} />
          <Link href="/dashboard/channels" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text">إعادة المحاولة</Link>
        </div>
      )}
      {linkNotice && <Notice tone={status === 'meta_success' ? 'success' : 'error'} message={linkNotice} />}

      <ChannelsConsole cards={cards} canManage={canManage} />

      <OwnerPresencePanel channels={presenceChannels} canManage={canManage} />

    </div>
  )
}

function isPausedNow(value: unknown): boolean {
  return typeof value === 'string' && Date.parse(value) > Date.now()
}

function Notice({ tone, message }: { tone: 'error' | 'warning' | 'success'; message: string }) {
  const className =
    tone === 'error'
      ? 'border-error/40 bg-error/10'
      : tone === 'success'
        ? 'border-success/40 bg-success/10'
        : 'border-warning/40 bg-warning/10'
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm text-text ${className}`}>
      {message}
    </p>
  )
}

