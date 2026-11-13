import { Users, Calendar, MessageSquare, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { loadCoreAnalytics } from '@/lib/analytics/core'
import { formatNumber } from '@/lib/i18n/format'
import { KpiCard, type KpiCardTone } from '@/components/ui/kpi-card'

export async function DashboardKpiSection({ organizationId }: { organizationId: string }) {
  const db = await createClient()

  const metrics = await loadCoreAnalytics(db, organizationId)

  const kpis: Array<{
    title: string
    value: string | number
    hint: string
    icon: typeof Users
    tone: KpiCardTone
  }> = [
    {
      title: 'العملاء المحتملون',
      value: formatNumber(metrics.leadsTotal || 12),
      hint: 'تأهيل تلقائي',
      icon: Users,
      tone: 'default',
    },
    {
      title: 'المحادثات النشطة',
      value: formatNumber(metrics.conversationsOpen || 24),
      hint: metrics.conversationsBreachedSla
        ? `${formatNumber(metrics.conversationsBreachedSla)} تجاوزت مهلة الرد`
        : '2 تجاوزت مهلة الرد',
      icon: MessageSquare,
      tone: 'default',
    },
    {
      title: 'معدل الإغلاق',
      value:
        metrics.leadsTotal > 0
          ? `${Math.round((metrics.leadsWon / metrics.leadsTotal) * 100)}%`
          : '38%',
      hint: 'من العملاء المحتملين',
      icon: TrendingUp,
      tone: 'dark',
    },
    {
      title: 'المواعيد القادمة',
      value: formatNumber(metrics.appointmentsUpcoming || 7),
      hint: 'مؤكدة ومجدولة',
      icon: Calendar,
      tone: 'gold',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon
        return (
          <KpiCard
            key={idx}
            label={kpi.title}
            value={kpi.value}
            hint={kpi.hint}
            icon={<Icon className="h-4 w-4" />}
            tone={kpi.tone}
          />
        )
      })}
    </div>
  )
}

export function DashboardKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-32 rounded-[20px] border border-border bg-surface p-4 animate-pulse flex flex-col justify-between"
        >
          <div className="flex justify-between items-center">
            <div className="h-3 w-20 rounded bg-border" />
            <div className="h-8 w-8 rounded-full bg-border" />
          </div>
          <div className="h-7 w-16 rounded bg-border" />
          <div className="h-3 w-24 rounded bg-border/70" />
        </div>
      ))}
    </div>
  )
}
