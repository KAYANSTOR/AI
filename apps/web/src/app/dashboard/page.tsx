import { Users, Calendar, MessageCircle, FileText, ShoppingCart, Clock, ArrowLeft, CheckCircle2, CircleAlert, RadioTower } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { formatDateTime, formatNumber } from '@/lib/i18n/format'
import { ar } from '@/lib/i18n/ar'
import { capabilityLabel } from '@/lib/i18n/labels'
import { loadCoreAnalytics } from '@/lib/analytics/core'

export default async function DashboardPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const supabase = await createClient()

  if (!context.setupComplete) {
    const { data: channels, error: channelError } = await supabase
      .from('channels')
      .select('id, is_active, verification_status')
      .eq('organization_id', context.organizationId)

    const availableChannels = channels ?? []
    const verifiedActiveChannelsCount = availableChannels.filter(
      (channel) => channel.is_active === true && channel.verification_status === 'verified'
    ).length
    const pendingActiveChannelsCount = availableChannels.filter(
      (channel) => channel.is_active === true && channel.verification_status === 'pending'
    ).length

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-text">{ar.dashboard.overview}</h1>
          <p className="mt-1 text-sm text-text-muted">{context.organizationName} · {ar.dashboard.welcome}</p>
        </header>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-light/40">
                <CircleAlert size={21} className="text-primary-dark" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text">أكمل إعداد نشاطك</h2>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  تابع من المرحلة التي توقفت عندها لإكمال تجهيز النشاط.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-text">
              الإعداد غير مكتمل
            </span>
          </div>

          <div className="mt-6 flex items-start gap-3 border-t border-border pt-5">
            <RadioTower size={18} className="mt-0.5 shrink-0 text-primary-dark" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-text">حالة قنوات التواصل</p>
              {channelError ? (
                <p className="mt-1 text-sm text-text-muted">تعذّر التحقق من القنوات حاليًا.</p>
              ) : (
                <p className="mt-1 text-sm text-text-muted">
                  {verifiedActiveChannelsCount > 0
                    ? `${formatNumber(verifiedActiveChannelsCount)} قناة مفعّلة ومتحقق منها`
                    : pendingActiveChannelsCount > 0
                      ? `${formatNumber(pendingActiveChannelsCount)} قناة قيد التحقق`
                      : availableChannels.length > 0
                        ? 'توجد قنوات تحتاج إلى التحقق أو التفعيل'
                        : 'لا توجد قناة مربوطة بعد'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary"
            >
              متابعة إعداد النشاط
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
            <p className="text-sm text-text-muted">أكمل الخطوات المتبقية لتجهيز مساحة العمل.</p>
          </div>
        </section>
      </div>
    )
  }

  const [metrics, contactsCountResult, conversationCountResult, channelResult, { data: upcoming }] = await Promise.all([
    loadCoreAnalytics(supabase, context.organizationId),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    supabase
      .from('channels')
      .select('id, is_active, verification_status')
      .eq('organization_id', context.organizationId),
    supabase
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name), services(name)')
      .eq('organization_id', context.organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
  ])

  const contactsCount = contactsCountResult.count ?? 0
  const conversationsCount = conversationCountResult.count ?? 0
  const channels = channelResult.data ?? []
  const verifiedActiveChannelsCount = channels.filter(
    (channel) => channel.is_active === true && channel.verification_status === 'verified'
  ).length
  const pendingActiveChannelsCount = channels.filter(
    (channel) => channel.is_active === true && channel.verification_status === 'pending'
  ).length
  const hasRealActivity =
    conversationsCount > 0 ||
    contactsCount > 0 ||
    metrics.leadsTotal > 0 ||
    metrics.appointmentsUpcoming > 0 ||
    metrics.quotesAccepted > 0 ||
    metrics.ordersCompleted > 0 ||
    metrics.followupsCompleted > 0

  if (!conversationCountResult.error && !hasRealActivity) {
    const setupIncomplete = !context.setupComplete
    const nextAction = setupIncomplete
      ? { href: '/onboarding', label: 'متابعة إعداد النشاط', description: 'أكمل الخطوات المتبقية لتجهيز مساحة العمل.' }
      : channelResult.error
        ? { href: '/dashboard/channels', label: 'التحقق من القنوات', description: 'افتح إدارة القنوات للتحقق من حالة الاتصال.' }
        : verifiedActiveChannelsCount === 0
        ? pendingActiveChannelsCount > 0
          ? { href: '/dashboard/channels', label: 'متابعة التحقق', description: 'قناتك قيد التحقق؛ راجع حالتها لإكمال الربط.' }
          : channels.length > 0
            ? { href: '/dashboard/channels', label: 'مراجعة القنوات', description: 'أكمل التحقق من قناة مفعّلة لاستقبال رسائل العملاء.' }
            : { href: '/dashboard/channels', label: 'ربط قناة التواصل', description: 'اربط القناة التي يتواصل من خلالها عملاؤك.' }
        : { href: '/dashboard/conversations', label: 'افتح صندوق المحادثات', description: 'تابع أول تواصل مع عميل من هنا.' }

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-text">{ar.dashboard.overview}</h1>
          <p className="mt-1 text-sm text-text-muted">{context.organizationName} · {ar.dashboard.welcome}</p>
        </header>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-light/40">
                {setupIncomplete || channelResult.error || verifiedActiveChannelsCount === 0 ? (
                  <CircleAlert size={21} className="text-primary-dark" aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={21} className="text-success" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text">
                  {setupIncomplete ? 'أكمل إعداد نشاطك' : 'ابدأ استقبال أول عميل'}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {setupIncomplete
                    ? 'تابع من المرحلة التي توقفت عندها لإكمال تجهيز النشاط.'
                    : 'ستظهر هنا مؤشرات الأداء بعد بدء التواصل مع العملاء.'}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${setupIncomplete || channelResult.error || verifiedActiveChannelsCount === 0 ? 'bg-warning/15 text-text' : 'bg-success/15 text-text'}`}>
              {setupIncomplete
                ? 'الإعداد غير مكتمل'
                : channelResult.error
                  ? 'تعذّر التحقق'
                  : verifiedActiveChannelsCount === 0 && pendingActiveChannelsCount > 0
                    ? 'قناة قيد التحقق'
                    : verifiedActiveChannelsCount === 0
                      ? 'بانتظار قناة متصلة'
                    : 'جاهز'}
            </span>
          </div>

          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <RadioTower size={18} className="mt-0.5 shrink-0 text-primary-dark" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-text">حالة قنوات التواصل</p>
                {channelResult.error ? (
                  <p className="mt-1 text-sm text-text-muted">تعذّر التحقق من القنوات حاليًا.</p>
                ) : (
                  <p className="mt-1 text-sm text-text-muted">
                    {verifiedActiveChannelsCount > 0
                      ? `${formatNumber(verifiedActiveChannelsCount)} قناة مفعّلة ومتحقق منها`
                      : pendingActiveChannelsCount > 0
                        ? `${formatNumber(pendingActiveChannelsCount)} قناة قيد التحقق`
                        : channels.length > 0
                          ? 'توجد قنوات تحتاج إلى التحقق أو التفعيل'
                          : 'لا توجد قناة مربوطة بعد'}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniMetric
                label={ar.dashboard.stats.contacts}
                value={contactsCountResult.error ? null : contactsCount}
              />
              <MiniMetric
                label="المحادثات"
                value={conversationCountResult.error ? null : conversationsCount}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href={nextAction.href}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary"
            >
              {nextAction.label}
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
            <p className="text-sm text-text-muted">{nextAction.description}</p>
            <Link
              href="/dashboard/conversations"
              className="text-sm font-medium text-primary-dark underline sm:ms-auto"
            >
              فتح صندوق المحادثات
            </Link>
            {!setupIncomplete && channelResult.error ? (
              <Link href="/dashboard/channels" className="text-sm font-medium text-primary-dark underline">
                إدارة القنوات
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {context.setupComplete && conversationCountResult.error ? (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          تعذّر التحقق من نشاط مساحة العمل؛ قد لا تعكس المؤشرات المعروضة النشاط الكامل.
        </p>
      ) : null}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.dashboard.overview}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {context.organizationName} · {ar.dashboard.welcome}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ar.dashboard.stats.leads}
          value={metrics.leadsTotal}
          icon={Users}
          hint={`مفتوح ${metrics.leadsOpen} · فوز ${metrics.leadsWon}`}
        />
        <StatCard
          title={ar.dashboard.stats.conversations}
          value={metrics.conversationsOpen}
          icon={MessageCircle}
          hint={
            metrics.conversationsBreachedSla
              ? `SLA متجاوز ${metrics.conversationsBreachedSla}`
              : undefined
          }
        />
        <StatCard title={ar.dashboard.stats.upcoming} value={metrics.appointmentsUpcoming} icon={Calendar} />
        <StatCard
          title="متابعة نشطة"
          value={metrics.followupsActive}
          icon={Clock}
          hint={`مكتمل ${metrics.followupsCompleted}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="عروض مفتوحة"
          value={metrics.quotesOpen}
          icon={FileText}
          hint={`مقبولة ${metrics.quotesAccepted}`}
        />
        <StatCard
          title="طلبات مفتوحة"
          value={metrics.ordersOpen}
          icon={ShoppingCart}
          hint={`مكتملة ${metrics.ordersCompleted}`}
        />
        <StatCard title={ar.dashboard.stats.contacts} value={contactsCount} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">{ar.dashboard.setupTitle}</h2>
              <p className="mt-1 text-sm text-text-muted">
                {context.setupComplete ? ar.dashboard.setupComplete : ar.dashboard.setupIncomplete}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                context.setupComplete ? 'bg-success/15 text-text' : 'bg-warning/15 text-text'
              }`}
            >
              {context.setupComplete ? ar.common.complete : ar.common.notSet}
            </span>
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-text">{ar.dashboard.enabledCapabilities}</h3>
          {context.enabledCapabilities.length ? (
            <ul className="flex flex-wrap gap-2">
              {context.enabledCapabilities.map((id) => (
                <li key={id} className="rounded-full bg-primary-light/30 px-3 py-1 text-xs text-primary-dark">
                  {capabilityLabel(id)}
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/dashboard/setup" className="text-sm font-medium text-primary-dark underline">
              {ar.dashboard.setupLink}
            </Link>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">{ar.dashboard.upcomingTitle}</h2>
          <div className="space-y-2">
            {!upcoming?.length ? (
              <p className="text-sm text-text-muted">{ar.dashboard.noUpcoming}</p>
            ) : (
              upcoming.map((appointment) => {
                const contact = appointment.contacts as unknown as { full_name: string | null } | null
                const service = appointment.services as unknown as { name: string } | null
                return (
                  <div
                    key={appointment.id}
                    className="flex min-w-0 items-start gap-3 rounded-lg p-3 hover:bg-background"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light/40 text-sm font-medium text-primary-dark">
                      {(contact?.full_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {contact?.full_name || ar.contacts.empty}
                      </p>
                      <p className="text-xs text-text-muted">
                        {service?.name || ar.services.title} ·{' '}
                        {formatDateTime(appointment.starts_at, context.timezone)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <Link
            href="/dashboard/appointments"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary-dark hover:underline"
          >
            {ar.appointments.title}{' '}
            <span aria-hidden="true" className="rtl:rotate-180">
              →
            </span>
          </Link>
        </section>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-background px-3 py-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">
        {value === null ? ar.common.unknown : formatNumber(value)}
      </p>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string
  value: number
  icon: React.ElementType
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-muted">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Icon size={20} className="text-primary-dark" />
        </div>
      </div>
      <h4 className="text-3xl font-bold tracking-tight text-text">{formatNumber(value)}</h4>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  )
}
