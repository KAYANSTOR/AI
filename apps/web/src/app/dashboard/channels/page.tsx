import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CHANNEL_SPECS, getChannelSpec, type ChannelType } from '@/lib/channels/management'
import { ChannelsConsole } from './channels-console'
import { PhonePanel } from './phone-panel'
import { ar } from '@/lib/i18n/ar'
import { formatNumber } from '@/lib/i18n/format'
import { databaseErrorMessage, logDatabaseError } from '@/lib/db/errors'

export const dynamic = 'force-dynamic'

type ChannelRow = {
  id: string
  channel_type: string
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

type ChannelViewData = {
  type: ChannelType
  label: string
  provider: string
  publicNumberLabel: string | null
  publicNumber: string | null
  connected: boolean
  verificationStatus: string | null
  isActive: boolean
}

export default async function ChannelsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'

  let rows: ChannelRow[] = []
  let channelsError: string | null = null
  try {
    const result = await supabase
      .from('channels')
      .select('id, channel_type, external_identifier, verification_status, is_active')
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

  let businessName = context.organizationName
  try {
    const { data: business } = await supabase
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

  let phoneConnection: {
    existing_phone_number: string | null
    internal_vapi_number: string | null
    carrier_profile_id: string | null
    forward_type: string | null
    forwarding_status: string | null
    last_verified_at: string | null
  } | null = null

  let carriers: Array<{
    id: string
    country_code: string
    operator_name: string
    forward_on_no_answer_code: string | null
    forward_on_busy_code: string | null
    forward_all_code: string | null
    cancel_forward_code: string | null
    setup_instructions_url: string | null
  }> = []

  try {
    const [{ data: conn }, { data: carrierList }] = await Promise.all([
      supabase
        .from('phone_connections')
        .select('existing_phone_number, internal_vapi_number, carrier_profile_id, forward_type, forwarding_status, last_verified_at')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      supabase
        .from('carrier_profiles')
        .select('id, country_code, operator_name, forward_on_no_answer_code, forward_on_busy_code, forward_all_code, cancel_forward_code, setup_instructions_url')
        .order('country_code', { ascending: true })
        .order('operator_name', { ascending: true }),
    ])
    phoneConnection = conn
    carriers = (carrierList ?? []) as typeof carriers
  } catch (error) {
    console.error('Unable to load phone connection or carriers', error)
  }

  const byType = new Map(rows.map((row) => [row.channel_type, row]))
  // Focused release: WhatsApp is the only customer-facing messaging channel.
  // Instagram and SMS remain backend-compatible but are intentionally not surfaced.
  const cards: ChannelViewData[] = CHANNEL_SPECS
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
      }
    })

  const verifiedCount = cards.filter(
    (card) => card.verificationStatus === 'verified' && card.isActive
  ).length

  const phoneSpec = getChannelSpec('phone')

  const phoneRow = byType.get('phone')
  const resolvedVapiNumber =
    phoneConnection?.internal_vapi_number || phoneRow?.external_identifier || null

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-dark">Kayan Connect</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            ابدأ بربط WhatsApp الذي يتواصل من خلاله عملاؤك، وسنتولى حفظ الربط والتحقق منه دون عرض
            المعرّفات السرية أو التقنية في المسار العادي.
          </p>
        </div>

        <div className="rounded-2xl border border-primary-light/60 bg-primary-light/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-primary-dark">النشاط المتصل</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="جاهزة" value={formatNumber(verifiedCount)} />
        <SummaryTile label="قيد الإعداد" value={formatNumber(cards.filter((card) => card.connected && card.verificationStatus !== 'verified').length)} />
        <SummaryTile label="الحالة" value={verifiedCount > 0 ? 'متصلة' : 'تحتاج ربطًا'} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text">
        <Info size={16} className="mt-0.5 shrink-0 text-primary-dark" aria-hidden="true" />
        <span>
          مفاتيح المزودين والأسرار لا تُعرض هنا. شاشة القنوات تتعامل مع الربط فقط، بينما تظل بيانات الاعتماد في الخادم.
        </span>
      </p>

      <ChannelsConsole cards={cards} canManage={canManage} />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-text">المكالمات</h2>
          <p className="text-sm text-text-muted">
            احتفظ برقم شركتك الحالي، ثم فعّل التحويل إلى الوكيل من دون شراء رقم جديد للمنصة.
          </p>
        </div>

        <PhonePanel
          canManage={canManage}
          timezone={context.timezone}
          carriers={carriers}
          instructions={phoneSpec?.setup ?? []}
          initial={
            phoneConnection || phoneRow
              ? {
                  existingPhoneNumber: phoneConnection?.existing_phone_number ?? null,
                  vapiNumber: canManage ? resolvedVapiNumber : null,
                  carrierProfileId: phoneConnection?.carrier_profile_id ?? null,
                  forwardType: phoneConnection?.forward_type ?? 'no_answer',
                  forwardingStatus: phoneConnection?.forwarding_status ?? (phoneRow?.is_active ? 'active' : 'pending_test'),
                  lastVerifiedAt: phoneConnection?.last_verified_at ?? null,
                }
              : null
          }
        />
      </section>
    </div>
  )
}

function Notice({ tone, message }: { tone: 'error' | 'warning'; message: string }) {
  const className =
    tone === 'error'
      ? 'border-error/40 bg-error/10'
      : 'border-warning/40 bg-warning/10'
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm text-text ${className}`}>
      {message}
    </p>
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
