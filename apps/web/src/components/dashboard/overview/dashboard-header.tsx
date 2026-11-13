import Link from 'next/link'
import { CalendarPlus, RadioTower, Sparkles } from 'lucide-react'

export function DashboardHeader({
  organizationName,
  setupComplete,
  timezone,
}: {
  organizationName: string
  setupComplete: boolean
  /** Organization IANA timezone; the server clock runs in UTC. */
  timezone?: string
}) {
  const today = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(isValidTimeZone(timezone) ? { timeZone: timezone } : {}),
  }).format(new Date())

  return (
    <div className="space-y-4">
      {/* 1. Agent Readiness Hero Card (Figma node 8:140 & 42:365) */}
      <div className="rounded-[24px] bg-dark p-5 text-[#d9c7a3] shadow-[0_24px_48px_-24px_rgba(31,42,31,0.28),0_2px_6px_rgba(31,42,31,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            {setupComplete ? 'جاهز للرد' : 'جاهز للرد'}
          </span>
          <div className="text-end">
            <p className="text-[12px] font-medium text-[#d9c7a3]/80">جاهزية الوكيل</p>
            <h2 className="text-[20px] font-bold text-[#d9c7a3]">الوكيل يرد على عملائك</h2>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-[#d9c7a3]/25 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: setupComplete ? '100%' : '80%' }}
            />
          </div>
          <p className="mt-2 text-end text-[12px] font-medium text-[#d9c7a3]/90">
            {setupComplete
              ? 'اكتملت جميع الخطوات — الوكيل مفعّل على جميع القنوات'
              : 'اكتمل 4 من 5 خطوات — بقي ربط قناة الاتصال الهاتفي'}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href="/dashboard/agent"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-dark shadow-sm transition hover:bg-accent/90 active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            <span>{setupComplete ? 'تجربة الوكيل الذكي' : 'أكمل الإعداد'}</span>
          </Link>
          <Link
            href="/dashboard/channels"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d9c7a3]/30 px-4 text-xs font-semibold text-[#d9c7a3] hover:bg-white/5"
          >
            <RadioTower className="h-4 w-4" />
            <span>ربط القنوات</span>
          </Link>
        </div>
      </div>

      {/* 2. Welcome Bar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
            <span>{today}</span>
            <span className="text-border-strong">·</span>
            <span className="text-primary font-bold">مرحباً، {organizationName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/appointments"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:border-secondary hover:text-secondary"
          >
            <CalendarPlus size={14} className="text-text-muted" />
            <span>حجز موعد جديد</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function isValidTimeZone(timezone: string | undefined): timezone is string {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
