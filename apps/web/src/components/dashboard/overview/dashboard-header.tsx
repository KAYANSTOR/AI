import Link from 'next/link'
import { Bot, CalendarPlus, RadioTower, Zap } from 'lucide-react'

export function DashboardHeader({
  organizationName,
  setupComplete: _setupComplete,
}: {
  organizationName: string
  setupComplete: boolean
}) {
  const today = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="space-y-4">
      {/* Top greeting bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
            <span>{today}</span>
            <span>·</span>
            <span className="flex items-center gap-1.5 font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              الوكيل الذكي متصل ومستعد
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">
            مرحباً بك، {organizationName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            مركز القيادة الموحد: يستقبل العملاء، يؤهلهم، يحجز المواعيد، ويدير العمليات على مدار الساعة.
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

      {/* Real-time Engine Highlight Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/10 via-primary/5 to-surface p-3.5 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Zap size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-text">محرك الاستجابة الفائقة: Gemini 3 Flash Preview</span>
              <span className="rounded-md bg-primary-light/40 px-2 py-0.5 text-[10px] font-bold text-primary-dark">
                سرعة معالجة ~0.8s
              </span>
            </div>
            <p className="text-text-muted text-[11px] truncate">
              يعمل الوكيل ببث حي متواصل مع استخراج تلقائي لبيانات العملاء وتأكيد المواعيد دون تأخير.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/agent"
          className="shrink-0 font-bold text-primary-dark hover:underline flex items-center gap-1 text-xs"
        >
          <span>تخصيص التعليمات والتدريب</span>
          <span aria-hidden="true" className="rtl:rotate-180">→</span>
        </Link>
      </div>
    </div>
  )
}
