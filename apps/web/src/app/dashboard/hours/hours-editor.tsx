'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, CalendarOff } from 'lucide-react'
import {
  saveWeeklyHoursAction,
  saveExceptionAction,
  deleteExceptionAction,
  type DayInput,
  type HoursResult,
} from './actions'

const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export type ExceptionRow = {
  id: string
  exception_date: string
  is_closed: boolean
  open_time: string | null
  close_time: string | null
  reason: string | null
}

type Props = {
  initialDays: DayInput[]
  exceptions: ExceptionRow[]
  canManage: boolean
}

export function HoursEditor({ initialDays, exceptions, canManage }: Props) {
  const router = useRouter()
  const [days, setDays] = useState<DayInput[]>(initialDays)
  const [result, setResult] = useState<HoursResult | null>(null)
  const [exception, setException] = useState({
    exceptionDate: '',
    isClosed: true,
    openTime: '09:00',
    closeTime: '17:00',
    reason: '',
  })
  const [pending, startTransition] = useTransition()

  function updateDay(index: number, patch: Partial<DayInput>) {
    setDays((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)))
  }

  function run(work: () => Promise<HoursResult>) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
      if (outcome.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text">ساعات العمل الأسبوعية</h2>
            <p className="text-xs text-muted mt-0.5">
              هذه القيم هي المصدر الوحيد لتوفر المواعيد — الوكيل لا يفترض أي ساعات من عنده.
            </p>
          </div>
        </header>

        <ul className="divide-y divide-border">
          {days.map((day, index) => (
            <li key={day.dayOfWeek} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-20 text-sm font-medium text-text">{DAY_LABELS[day.dayOfWeek]}</span>

              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!day.isClosed}
                  disabled={!canManage}
                  onChange={(event) => updateDay(index, { isClosed: !event.target.checked })}
                  className="h-4 w-4 accent-[color:var(--color-primary)]"
                />
                مفتوح
              </label>

              <input
                type="time"
                value={day.openTime}
                disabled={!canManage || day.isClosed}
                onChange={(event) => updateDay(index, { openTime: event.target.value })}
                className="rounded-lg border border-border px-2 py-1 text-sm text-text disabled:bg-background disabled:text-muted"
              />
              <span className="text-xs text-muted">إلى</span>
              <input
                type="time"
                value={day.closeTime}
                disabled={!canManage || day.isClosed}
                onChange={(event) => updateDay(index, { closeTime: event.target.value })}
                className="rounded-lg border border-border px-2 py-1 text-sm text-text disabled:bg-background disabled:text-muted"
              />

              {day.isClosed && (
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">مغلق</span>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <footer className="border-t border-border px-4 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveWeeklyHoursAction(days))}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {pending && <Loader2 className="animate-spin" size={14} />}
              حفظ ساعات العمل
            </button>
          </footer>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <header className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
            <CalendarOff size={16} className="text-primary-dark" />
            استثناءات التواريخ (إجازات وأوقات خاصة)
          </h2>
          <p className="text-xs text-muted mt-0.5">
            الاستثناء يتقدّم على الجدول الأسبوعي لذاك التاريخ فقط.
          </p>
        </header>

        {exceptions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">لا توجد استثناءات مسجلة.</p>
        ) : (
          <ul className="divide-y divide-border">
            {exceptions.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text">{row.exception_date}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {row.is_closed
                      ? 'مغلق'
                      : `${(row.open_time ?? '').slice(0, 5)} – ${(row.close_time ?? '').slice(0, 5)}`}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteExceptionAction(row.id))}
                    className="rounded-lg border border-border p-2 text-muted transition-colors hover:border-error/40 hover:text-error"
                    aria-label="حذف الاستثناء"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <footer className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted">
              التاريخ
              <input
                type="date"
                value={exception.exceptionDate}
                onChange={(event) => setException({ ...exception, exceptionDate: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-sm text-text"
              />
            </label>
            <label className="flex items-end gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={exception.isClosed}
                onChange={(event) => setException({ ...exception, isClosed: event.target.checked })}
                className="h-4 w-4 accent-[color:var(--color-primary)]"
              />
              إغلاق كامل في هذا التاريخ
            </label>
            <label className="text-xs text-muted">
              من
              <input
                type="time"
                value={exception.openTime}
                disabled={exception.isClosed}
                onChange={(event) => setException({ ...exception, openTime: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-sm text-text disabled:bg-background"
              />
            </label>
            <label className="text-xs text-muted">
              إلى
              <input
                type="time"
                value={exception.closeTime}
                disabled={exception.isClosed}
                onChange={(event) => setException({ ...exception, closeTime: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-sm text-text disabled:bg-background"
              />
            </label>
            <label className="text-xs text-muted sm:col-span-2 lg:col-span-3">
              السبب (اختياري)
              <input
                type="text"
                value={exception.reason}
                maxLength={255}
                onChange={(event) => setException({ ...exception, reason: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-sm text-text"
                placeholder="عيد رسمي"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={pending || !exception.exceptionDate}
                onClick={() => run(() => saveExceptionAction(exception))}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                <Plus size={14} />
                إضافة استثناء
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
