import { Users, CalendarDays, MessageSquareText, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { loadCoreAnalytics } from '@/lib/analytics/core'
import { formatNumber } from '@/lib/i18n/format'

export async function DashboardKpiSection({ organizationId }: { organizationId: string }) {
  const db = await createClient()
  const metrics = await loadCoreAnalytics(db, organizationId)
  const breachRate = metrics.conversationsOpen > 0
    ? Math.min(100, Math.round((metrics.conversationsBreachedSla / metrics.conversationsOpen) * 100))
    : 0

  return (
    <section className="space-y-3" aria-label="ملخص النشاط">
      <div className="grid grid-cols-3 gap-2">
        <StatusPill icon={<AlertTriangle size={15} aria-hidden="true" />} label="تجاوز المهلة" value={formatNumber(metrics.conversationsBreachedSla)} tone={metrics.conversationsBreachedSla > 0 ? 'warning' : 'neutral'} />
        <StatusPill icon={<MessageSquareText size={15} aria-hidden="true" />} label="محادثات نشطة" value={formatNumber(metrics.conversationsOpen)} tone="primary" />
        <StatusPill icon={<CalendarDays size={15} aria-hidden="true" />} label="مواعيد قادمة" value={formatNumber(metrics.appointmentsUpcoming)} tone="neutral" />
      </div>
      <div className="dashboard-kpi-hero">
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-primary/85">نظرة سريعة على خدمة العملاء</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-primary">{formatNumber(metrics.conversationsOpen)}</h2>
            <p className="mt-1 text-sm font-semibold text-primary">محادثة نشطة</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary-dark shadow-sm"><MessageSquareText size={21} aria-hidden="true" /></span>
        </div>
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3">
            <div className="flex items-center gap-1.5 text-primary/80"><Users size={14} aria-hidden="true" /><span className="text-[11px] font-medium">عملاء مفتوحون</span></div>
            <p className="mt-2 text-xl font-extrabold text-primary">{formatNumber(metrics.leadsOpen)}</p>
          </div>
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3">
            <div className="flex items-center gap-1.5 text-primary/80"><CalendarDays size={14} aria-hidden="true" /><span className="text-[11px] font-medium">مواعيد قادمة</span></div>
            <p className="mt-2 text-xl font-extrabold text-primary">{formatNumber(metrics.appointmentsUpcoming)}</p>
          </div>
        </div>
        <div className="relative z-10 mt-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-primary/80">
            <span>المحادثات التي تجاوزت مهلة الرد</span>
            <span className="font-bold tabular-nums">{formatNumber(metrics.conversationsBreachedSla)} / {formatNumber(metrics.conversationsOpen)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary/20" role="progressbar" aria-label="نسبة المحادثات المتجاوزة لمهلة الرد" aria-valuemin={0} aria-valuemax={100} aria-valuenow={breachRate}>
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: breachRate + '%' }} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-primary/75">
            {metrics.conversationsBreachedSla > 0
              ? <><AlertTriangle size={12} aria-hidden="true" /> تحتاج بعض المحادثات إلى متابعة</>
              : <><CheckCircle2 size={12} aria-hidden="true" /> لا توجد محادثات متجاوزة للمهلة</>}
          </p>
        </div>
      </div>
    </section>
  )
}

function StatusPill({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'warning' | 'neutral' | 'primary' }) {
  return (
    <div className={'dashboard-status-pill tone-' + tone}>
      <span className="flex items-center justify-center gap-1.5">{icon}<span className="truncate">{label}</span></span>
      <strong className="mt-1 block text-sm tabular-nums">{value}</strong>
    </div>
  )
}

export function DashboardKpiSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-3 gap-2">{[1,2,3].map((item) => <div key={item} className="h-16 rounded-2xl bg-surface-muted" />)}</div>
      <div className="h-64 rounded-3xl bg-primary-dark/20" />
    </div>
  )
}
