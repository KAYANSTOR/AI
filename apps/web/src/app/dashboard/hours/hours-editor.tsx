'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus, Trash2, CalendarOff } from 'lucide-react'
import {
  saveWeeklyHoursAction,
  saveExceptionAction,
  deleteExceptionAction,
  type DayInput,
  type HoursResult,
} from './actions'
import { ar } from '@/lib/i18n/ar'
import { formatDate } from '@/lib/i18n/format'

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
  timezone: string
}

export function HoursEditor({ initialDays, exceptions, canManage, timezone }: Props) {
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
            <h2 className="text-sm font-semibold text-text">{ar.hours.weekly}</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {ar.hours.closedDays}
            </p>
          </div>
        </header>

        <ul className="divide-y divide-border">
          {days.map((day, index) => (
            <li key={day.dayOfWeek} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-20 text-sm font-medium text-text">{ar.hours.weekdays[day.dayOfWeek]}</span>

              <label className="flex min-h-11 items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={!day.isClosed}
                  disabled={!canManage}
                  onChange={(event) => updateDay(index, { isClosed: !event.target.checked })}
                  className="h-5 w-5 accent-[color:var(--color-primary)]"
                />
                {ar.hours.open}
              </label>

              <input
                type="time"
                value={day.openTime}
                disabled={!canManage || day.isClosed}
                onChange={(event) => updateDay(index, { openTime: event.target.value })}
                className="min-h-11 rounded-lg border border-border px-2 py-1 text-base text-text disabled:bg-background disabled:text-text-muted md:text-sm"
              />
              <span className="text-xs text-text-muted">إلى</span>
              <input
                type="time"
                value={day.closeTime}
                disabled={!canManage || day.isClosed}
                onChange={(event) => updateDay(index, { closeTime: event.target.value })}
                className="min-h-11 rounded-lg border border-border px-2 py-1 text-base text-text disabled:bg-background disabled:text-text-muted md:text-sm"
              />

              {day.isClosed && (
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">{ar.hours.closed}</span>
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
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 md:w-auto md:text-sm"
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
            {ar.hours.exceptions}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {ar.hours.exceptionDescription}
          </p>
        </header>

        {exceptions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-muted">{ar.hours.noExceptions}</p>
        ) : (
          <ul className="divide-y divide-border">
            {exceptions.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text">
                    {formatDate(`${row.exception_date}T12:00:00.000Z`, timezone)}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {row.is_closed
                      ? ar.hours.closed
                      : `${(row.open_time ?? '').slice(0, 5)} – ${(row.close_time ?? '').slice(0, 5)}`}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteExceptionAction(row.id))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-error/40 hover:text-error"
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
            <label className="text-xs text-text-muted">
              {ar.hours.date}
              <input
                type="date"
                value={exception.exceptionDate}
                onChange={(event) => setException({ ...exception, exceptionDate: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1 text-base text-text md:text-sm"
              />
            </label>
            <label className="flex min-h-11 items-end gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={exception.isClosed}
                onChange={(event) => setException({ ...exception, isClosed: event.target.checked })}
                className="h-5 w-5 accent-[color:var(--color-primary)]"
              />
              {ar.hours.closeAll}
            </label>
            <label className="text-xs text-text-muted">
              {ar.hours.from}
              <input
                type="time"
                value={exception.openTime}
                disabled={exception.isClosed}
                onChange={(event) => setException({ ...exception, openTime: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1 text-base text-text disabled:bg-background md:text-sm"
              />
            </label>
            <label className="text-xs text-text-muted">
              {ar.hours.to}
              <input
                type="time"
                value={exception.closeTime}
                disabled={exception.isClosed}
                onChange={(event) => setException({ ...exception, closeTime: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1 text-base text-text disabled:bg-background md:text-sm"
              />
            </label>
            <label className="text-xs text-text-muted sm:col-span-2 lg:col-span-3">
              {ar.hours.reason}
              <input
                type="text"
                value={exception.reason}
                maxLength={255}
                onChange={(event) => setException({ ...exception, reason: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1 text-base text-text md:text-sm"
                placeholder="عيد رسمي"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={pending || !exception.exceptionDate}
                onClick={() => run(() => saveExceptionAction(exception))}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-base font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60 md:text-sm"
              >
                <Plus size={14} />
                {ar.hours.addException}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
