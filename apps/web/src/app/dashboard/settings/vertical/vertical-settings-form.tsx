'use client'

import { useState, useTransition } from 'react'
import { updateVerticalConfigAction } from './actions'
import type { VerticalLabels } from '@/lib/verticals/registry'

export function VerticalSettingsForm({
  verticalName,
  engine,
  modules,
  initialPrompt,
  initialLabels,
}: {
  verticalName: string
  engine: string
  modules: string[]
  initialPrompt: string
  initialLabels: VerticalLabels
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [labels, setLabels] = useState(initialLabels)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateVerticalConfigAction({ systemPrompt: prompt, labels })
      if (!result.ok) {
        setError(result.error ?? 'تعذر حفظ الإعدادات.')
        return
      }
      setMessage('تم حفظ إعدادات النشاط.')
    })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-text">{verticalName}</h2>
        <p className="mt-1 text-sm text-text-muted">محرك القطاع: <span dir="ltr">{engine}</span></p>
        <p className="mt-2 text-xs text-text-muted">الوحدات الجاهزة: {modules.join('، ')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as Array<keyof VerticalLabels>).map((key) => (
          <label key={key} className="block text-sm font-medium text-text">
            {key === 'appointments' ? 'اسم المواعيد' : key === 'orders' ? 'اسم الطلبات' : key === 'leads' ? 'اسم العملاء المحتملين' : key === 'services' ? 'اسم الخدمات والمنتجات' : key === 'contacts' ? 'اسم جهات الاتصال' : 'اسم عروض الأسعار'}
            <input
              value={labels[key]}
              maxLength={80}
              onChange={(event) => setLabels((current) => ({ ...current, [key]: event.target.value }))}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40"
            />
          </label>
        ))}
      </div>
      <label className="block text-sm font-medium text-text">
        تعليمات الوكيل لهذا النشاط
        <textarea
          value={prompt}
          maxLength={3000}
          rows={8}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40"
        />
        <span className="mt-1 block text-xs text-text-muted">حد أقصى 3000 حرف. تبقى ضوابط الأمان وواتساب وسلطة تنفيذ الأدوات ثابتة.</span>
      </label>
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
      <button type="button" onClick={save} disabled={pending} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
        {pending ? 'جارٍ الحفظ…' : 'حفظ إعدادات النشاط'}
      </button>
    </section>
  )
}
