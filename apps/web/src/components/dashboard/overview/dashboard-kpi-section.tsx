import { Users, Calendar, MessageSquare } from 'lucide-react'
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
      value: formatNumber(metrics.leadsTotal),
      hint: metrics.leadsOpen > 0 ? `${formatNumber(metrics.leadsOpen)} مفتوح` : 'لا عملاء مفتوحين',
      icon: Users,
      tone: 'default',
    },
    {
      title: 'المواعيد القادمة',
      value: formatNumber(metrics.appointmentsUpcoming),
      hint: metrics.appointmentsUpcoming > 0 ? 'مؤكدة ومجدولة' : 'لا مواعيد قادمة',
      icon: Calendar,
      tone: 'gold',
    },
    {
      title: 'المحادثات النشطة',
      value: formatNumber(metrics.conversationsOpen),
      hint:
        metrics.conversationsBreachedSla > 0
          ? `${formatNumber(metrics.conversationsBreachedSla)} تجاوزت مهلة الرد`
          : 'ضمن المهلة',
      icon: MessageSquare,
      tone: 'dark',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex h-32 animate-pulse flex-col justify-between rounded-[20px] border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-border" />
            <div className="h-8 w-8 rounded-full bg-border" />
          </div>
          <div className="space-y-2">
            <div className="h-7 w-16 rounded bg-border" />
            <div className="h-3 w-24 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  )
}
