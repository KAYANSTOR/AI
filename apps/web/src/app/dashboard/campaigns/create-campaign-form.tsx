'use client'

import { useState, useTransition } from 'react'
import { createCampaignAction } from './actions'

export function CreateCampaignForm() {
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
          const result = await createCampaignAction({
            name: String(fd.get('name') || ''),
            channel: String(fd.get('channel') || 'whatsapp'),
            templateBody: String(fd.get('templateBody') || ''),
            scheduledAt: String(fd.get('scheduledAt') || '') || null,
            rateLimitPerMinute: Number(fd.get('rateLimitPerMinute') || 30),
          })
          if (!result.ok) setError(result.error)
          else {
            setOk('تم إنشاء الحملة كمسودة. يمكنك بدء الإرسال من الجدول.')
            e.currentTarget.reset()
          }
        })
      }}
    >
      <h2 className="text-base font-semibold text-text">إنشاء حملة</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">اسم الحملة</span>
          <input
            name="name"
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">القناة</span>
          <select
            name="channel"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
            defaultValue="whatsapp"
          >
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">حد الإرسال / دقيقة</span>
          <input
            name="rateLimitPerMinute"
            type="number"
            min={1}
            max={120}
            defaultValue={30}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">نص الرسالة</span>
          <textarea
            name="templateBody"
            required
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">جدولة (اختياري)</span>
          <input
            name="scheduledAt"
            type="datetime-local"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
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
        {pending ? 'جاري الإنشاء…' : 'إنشاء حملة'}
      </button>
    </form>
  )
}
