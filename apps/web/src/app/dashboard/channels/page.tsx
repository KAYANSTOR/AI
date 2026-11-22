import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CHANNEL_SPECS } from '@/lib/channels/management'
import { ChannelsConsole } from './channels-console'
import { ar } from '@/lib/i18n/ar'
import { formatNumber } from '@/lib/i18n/format'
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
      .eq('channel_type', 'whatsapp')

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

  let businessName = context.organizationName
  try {
    const { data: business } = await db
      .from('businesses')
      .select('id, name')
      .eq('organization_id', context.organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (business?.name) businessName = String(business.name)
  } catch (error) {
    console.error('Unable to load business summary', error)
  }

  const byType = new Map(rows.map((row) => [row.channel_type, row]))
  // Focused release: WhatsApp is the only customer-facing messaging channel.
  // Instagram and SMS remain backend-compatible but are intentionally not surfaced.
  const cards = CHANNEL_SPECS
    .filter((spec) => spec.type === 'whatsapp')
    .map((spec) => {
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

  const verifiedCount = cards.filter(
    (card) => card.verificationStatus === 'verified' && card.isActive
  ).length

  return (
    <div className="space-y-6">
      <header className="space-y-4 rounded-[1.15rem] border border-border bg-background/55 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Kayan Connect</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            ابدأ بربط WhatsApp الذي يتواصل من خلاله عملاؤك، وسنتولى حفظ الربط والتحقق منه دون عرض
            المعرّفات السرية أو التقنية في المسار العادي.
          </p>
        </div>

        <div className="rounded-2xl border border-primary-light/60 bg-primary-light/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary">النشاط المتصل</p>
              <p className="mt-1 text-sm font-bold text-text">{businessName}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface px-4 py-3 text-center">
              <p className="text-xs text-text-muted">قناة التواصل الأساسية</p>
              <p className="mt-0.5 text-xl font-bold text-text">{formatNumber(verifiedCount)} / {formatNumber(cards.length)}</p>
            </div>
          </div>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="جاهزة" value={formatNumber(verifiedCount)} />
        <SummaryTile label="قيد الإعداد" value={formatNumber(cards.filter((card) => card.connected && card.verificationStatus !== 'verified').length)} />
        <SummaryTile label="الحالة" value={verifiedCount > 0 ? 'متصلة' : 'تحتاج ربطًا'} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text">
        <Info size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
        <span>
          مفاتيح المزودين والأسرار لا تُعرض هنا. شاشة القنوات تتعامل مع الربط فقط، بينما تظل بيانات الاعتماد في الخادم.
        </span>
      </p>

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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tracking-tight text-text">{value}</p>
    </div>
  )
}
