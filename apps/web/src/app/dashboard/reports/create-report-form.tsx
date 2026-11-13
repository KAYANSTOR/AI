'use client'

import { useState, useTransition } from 'react'
import { createReportAction } from './actions'

export function CreateReportForm() {
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        setOk(null)
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const result = await createReportAction({
            name: String(fd.get('name') || ''),
            reportType: String(fd.get('reportType') || 'analytics'),
            description: String(fd.get('description') || ''),
            scheduleCron: String(fd.get('scheduleCron') || '') || null,
          })
          if (!result.ok) setError(result.error)
          else {
            setOk('تم حفظ التقرير.')
            e.currentTarget.reset()
          }
        })
      }}
    >
      <h2 className="text-base font-semibold text-text">إنشاء تقرير محفوظ</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">الاسم</span>
          <input
            name="name"
            required
            minLength={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
            placeholder="ملخص محادثات أسبوعي"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">النوع</span>
          <select
            name="reportType"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
            defaultValue="conversations"
          >
            <option value="conversations">محادثات</option>
            <option value="leads">عملاء محتملون</option>
            <option value="analytics">تحليلات</option>
            <option value="orders">طلبات</option>
            <option value="appointments">مواعيد</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">وصف (اختياري)</span>
          <input
            name="description"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">جدولة cron (اختياري)</span>
          <input
            name="scheduleCron"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm text-text"
            placeholder="0 9 * * 1"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'جاري الحفظ…' : 'حفظ التقرير'}
      </button>
    </form>
  )
}
