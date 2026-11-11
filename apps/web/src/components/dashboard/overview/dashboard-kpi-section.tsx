import { Users, Calendar, MessageSquare, FileText, ShoppingCart, Clock, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { loadCoreAnalytics } from '@/lib/analytics/core'
import { formatNumber } from '@/lib/i18n/format'

export async function DashboardKpiSection({ organizationId }: { organizationId: string }) {
  const db = await createClient()

  const [metrics, contactsCountResult, conversationCountResult] = await Promise.all([
    loadCoreAnalytics(db, organizationId),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ])

  const contactsCount = contactsCountResult.count ?? 0
  const conversationsTotal = conversationCountResult.count ?? 0

  const kpis = [
    {
      title: 'العملاء المحتملون',
      value: metrics.leadsTotal,
      subtitle: `مفتوح ${formatNumber(metrics.leadsOpen)} · تم الفوز ${formatNumber(metrics.leadsWon)}`,
      icon: Users,
      highlight: metrics.leadsWon > 0 ? `${formatNumber(metrics.leadsWon)} تحولوا لعملاء` : 'يتم التأهيل تلقائيًا من المحادثات',
      tone: 'primary',
    },
    {
      title: 'المحادثات النشطة',
      value: metrics.conversationsOpen,
      subtitle: `إجمالي المحادثات ${formatNumber(conversationsTotal)}`,
      icon: MessageSquare,
      highlight: metrics.conversationsBreachedSla ? `${formatNumber(metrics.conversationsBreachedSla)} تجاوزت مهلة الرد` : 'كل المحادثات ضمن مهلة الرد',
      tone: metrics.conversationsBreachedSla ? 'warning' : 'neutral',
    },
    {
      title: 'المواعيد القادمة',
      value: metrics.appointmentsUpcoming,
      subtitle: 'حجوزات مجدولة ومؤكدة',
      icon: Calendar,
      highlight: metrics.appointmentsUpcoming > 0 ? 'مواعيد بانتظار الخدمة' : 'لا توجد مواعيد اليوم',
      tone: 'success',
    },
    {
      title: 'المتابعات النشطة',
      value: metrics.followupsActive,
      subtitle: `مكتمل ${formatNumber(metrics.followupsCompleted)} متابعة تلقائية`,
      icon: Clock,
      highlight: 'تذكيرات تلقائية للعملاء',
      tone: 'info',
    },
    {
      title: 'عروض الأسعار المفتوحة',
      value: metrics.quotesOpen,
      subtitle: `عروض مقبولة: ${formatNumber(metrics.quotesAccepted)}`,
      icon: FileText,
      highlight: 'عروض أسعار معتمدة',
      tone: 'neutral',
    },
    {
      title: 'الطلبات والعمليات',
      value: metrics.ordersOpen,
      subtitle: `مكتملة: ${formatNumber(metrics.ordersCompleted)}`,
      icon: ShoppingCart,
      highlight: 'متابعة مراحل التنفيذ',
      tone: 'neutral',
    },
    {
      title: 'دليل جهات الاتصال',
      value: contactsCount,
      subtitle: 'كل العملاء المسجلين',
      icon: Users,
      highlight: 'سجل موحد لكل عميل',
      tone: 'neutral',
    },
    {
      title: 'معدل الإغلاق',
      valueText:
        metrics.leadsTotal > 0 ? `${Math.round((metrics.leadsWon / metrics.leadsTotal) * 100)}%` : '—',
      subtitle: 'نسبة العملاء المحتملين الذين تحولوا لعملاء',
      icon: TrendingUp,
      highlight: metrics.leadsTotal > 0 ? `${formatNumber(metrics.leadsWon)} من ${formatNumber(metrics.leadsTotal)}` : 'لا توجد بيانات كافية بعد',
      tone: 'success',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon
        return (
          <div
            key={idx}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-5 transition-colors hover:border-border-strong"
          >
            <div className="flex items-center gap-2 text-text-muted">
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              <span className="text-xs font-semibold">{kpi.title}</span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-[2rem] font-semibold tabular-nums leading-none text-text">
                {kpi.valueText ?? formatNumber(kpi.value ?? 0)}
              </span>
            </div>

            <p className="mt-1.5 text-xs text-text-muted">{kpi.subtitle}</p>

            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
              {kpi.tone === 'success' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              ) : kpi.tone === 'warning' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              )}
              <span className="truncate">{kpi.highlight}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DashboardKpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-card)] border border-border bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 rounded bg-border/60" />
            <div className="h-9 w-9 rounded-xl bg-border/40" />
          </div>
          <div className="h-8 w-16 rounded bg-border/80" />
          <div className="h-3 w-36 rounded bg-border/40" />
          <div className="border-t border-border/40 pt-2 h-3 w-24 rounded bg-border/30" />
        </div>
      ))}
    </div>
  )
}
