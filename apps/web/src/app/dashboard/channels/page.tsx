import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CHANNEL_SPECS } from '@/lib/channels/management'
import { ChannelsConsole } from './channels-console'
import { ar } from '@/lib/i18n/ar'
import { databaseErrorMessage, logDatabaseError } from '@/lib/db/errors'

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

  const db = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'

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

  const byType = new Map(rows.map((row) => [row.channel_type, row]))
  // Render only channel types backed by an existing server-side integration.
  const cards = CHANNEL_SPECS.map((spec) => {
      const row = byType.get(spec.type)
      return {
        type: spec.type,
        label: spec.label,
        provider: spec.provider,
        publicNumberLabel: spec.publicNumberLabel,
        publicNumber: row?.external_identifier ?? null,
        connected: Boolean(row?.id),
        verificationStatus: row?.verification_status ?? null,
        isActive: row?.is_active === true,
        connectionMode: row?.connection_mode ?? null,
      }
    })

  return (
    <div className="space-y-6">
      <header className="space-y-4 rounded-[1.15rem] border border-border bg-background/55 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Kayan Connect</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            اربط قنوات التواصل التي يستخدمها عملاؤك، وأدر حالة كل قناة من مكان واحد. تظهر هنا القنوات المدعومة فعلياً في حسابك.
          </p>
        </div>

      </header>

      {!canManage && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-6 text-text">
          أنت في وضع الاطلاع فقط. يستطيع المالك أو المسؤول ربط القنوات أو تعديلها.
        </p>
      )}

      {channelsError && <Notice tone="error" message={channelsError} />}
      {status === 'meta_success' && (
        <Notice tone="success" message="تم تفويض حساب Meta وحفظ بيانات القناة. افتح بطاقة WhatsApp لمراجعة حالة الربط والخطوة التالية المناسبة لنوع الاتصال." />
      )}
      {status === 'meta_error' && (
        <Notice tone="error" message="تعذّر إكمال ربط Meta. أعد المحاولة من بطاقة WhatsApp ثم استخدم إعادة فحص الاتصال." />
      )}

      <ChannelsConsole cards={cards} canManage={canManage} />

    </div>
  )
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

