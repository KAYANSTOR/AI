import Link from 'next/link'
import { Bot, CalendarPlus, RadioTower } from 'lucide-react'

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
            <span>{today}</span>
            <span>·</span>
            <span className={`flex items-center gap-1.5 font-medium ${setupComplete ? 'text-success' : 'text-warning'}`}>
              <span className={`inline-flex h-2 w-2 rounded-full ${setupComplete ? 'bg-success' : 'bg-warning'}`} />
              {setupComplete ? 'الوكيل يعمل' : 'الوكيل بانتظار إكمال الإعداد'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">
            مرحبًا، {organizationName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            ملخص نشاط شركتك اليوم: المحادثات، العملاء، والمواعيد.
          </p>
        </div>

        {/* Quick Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/agent"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-primary-dark"
          >
            <Bot size={16} />
            <span>تجربة الوكيل الذكي</span>
          </Link>
          <Link
            href="/dashboard/appointments"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold text-text transition-colors hover:border-primary-dark hover:text-primary-dark shadow-2xs"
          >
            <CalendarPlus size={15} className="text-text-muted" />
            <span>حجز موعد جديد</span>
          </Link>
          <Link
            href="/dashboard/channels"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold text-text transition-colors hover:border-primary-dark hover:text-primary-dark shadow-2xs"
          >
            <RadioTower size={15} className="text-text-muted" />
            <span>القنوات والربط</span>
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
