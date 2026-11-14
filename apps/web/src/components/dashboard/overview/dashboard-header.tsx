import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'

export function DashboardHeader({
  timezone,
}: {
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
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted">{today}</p>
        <h1 className="mt-1 text-2xl font-bold text-text sm:text-[28px]">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-text-muted">نظرة عامة على نشاطك والعمليات الجارية.</p>
      </div>
      <Link
        href="/dashboard/appointments"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark active:scale-[0.98]"
      >
        <CalendarPlus size={16} aria-hidden="true" />
        <span>استعراض المواعيد</span>
      </Link>
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
