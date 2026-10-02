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

  const byType = new Map(rows.map((row) => [row.channel_type, row]))
  const cards: ChannelViewData[] = CHANNEL_SPECS
    .filter((spec) => spec.type !== 'phone')
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

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-dark">Kayan Connect</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{ar.channels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            اربط القنوات من مكان واحد. ابدأ بما يراه العميل: الرقم أو الحساب، وسنتولى حفظ الربط والتحقق منه دون عرض
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
              <p className="text-xs text-text-muted">القنوات الجاهزة</p>
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
        <SummaryTile label="غير مربوطة" value={formatNumber(cards.filter((card) => !card.connected).length)} />
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
          instructions={phoneSpec?.setup ?? []}
          initial={
            phoneConnection
              ? {
                  existingPhoneNumber: phoneConnection.existing_phone_number ?? null,
                  vapiNumber: canManage ? (phoneConnection.internal_vapi_number ?? null) : null,
                  forwardType: phoneConnection.forward_type ?? 'no_answer',
                  forwardingStatus: phoneConnection.forwarding_status ?? 'pending_test',
                  lastVerifiedAt: phoneConnection.last_verified_at ?? null,
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
