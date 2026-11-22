'use client'

import { useState, useTransition } from 'react'
import { createCampaignAction } from './actions'

type CampaignSegment = { id: string; name: string }

export function CreateCampaignForm({ segments }: { segments: CampaignSegment[] }) {
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
        const form = e.currentTarget
        const fd = new FormData(form)
        const audience = String(fd.get('audience') || '')
        start(async () => {
          const result = await createCampaignAction({
            name: String(fd.get('name') || ''),
            channel: String(fd.get('channel') || 'whatsapp'),
            templateBody: String(fd.get('templateBody') || ''),
            scheduledAt: String(fd.get('scheduledAt') || '') || null,
            rateLimitPerMinute: Number(fd.get('rateLimitPerMinute') || 30),
            segmentId: audience && audience !== 'all_with_phone' ? audience : null,
            audienceCriteria: audience === 'all_with_phone' ? { hasPhone: true } : null,
          })
          if (!result.ok) setError(result.error)
          else {
            setOk('تم إنشاء الحملة كمسودة. لن يبدأ الإرسال إلا بعد توفر جمهور وموافقة تسويقية صريحة.')
            form.reset()
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
          <span className="mb-1 block text-text-muted">الجمهور المستهدف</span>
          <select
            name="audience"
            required
            defaultValue="all_with_phone"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text"
          >
            <option value="all_with_phone">كل جهات الاتصال التي لديها رقم هاتف</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                شريحة محفوظة: {segment.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-text-muted">
            لن تُرسل الرسائل إلا لجهات الاتصال التي لديها موافقة تسويقية صريحة على WhatsApp.
          </span>
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
