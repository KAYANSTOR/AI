'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Pencil, Plus, X } from 'lucide-react'
import { saveLocationAction, setLocationActiveAction, type LocationResult } from './actions'

export type LocationRow = {
  id: string
  name: string
  address: string | null
  timezone: string | null
  is_active: boolean
  metadata: { phone?: string } | null
}

const EMPTY = { id: null as string | null, name: '', address: '', phone: '', timezone: '' }

export function LocationsManager({ rows, canManage }: { rows: LocationRow[]; canManage: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [result, setResult] = useState<LocationResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run(work: () => Promise<LocationResult>, resetOnSuccess = false) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
      if (outcome.ok) {
        if (resetOnSuccess) setForm(EMPTY)
        router.refresh()
      }
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

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          لا توجد فروع بعد.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-text">
                  <MapPin size={15} className="text-primary-dark" />
                  {row.name}
                  {!row.is_active && (
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">معطّل</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {[row.address, row.metadata?.phone, row.timezone].filter(Boolean).join(' · ') ||
                    'لا توجد تفاصيل إضافية'}
                </p>
              </div>

              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setForm({
                        id: row.id,
                        name: row.name,
                        address: row.address ?? '',
                        phone: row.metadata?.phone ?? '',
                        timezone: row.timezone ?? '',
                      })
                    }
                    className="rounded-lg border border-border p-2 text-muted transition-colors hover:text-primary-dark"
                    aria-label="تعديل"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setLocationActiveAction(row.id, !row.is_active))}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary/50"
                  >
                    {row.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">
              {form.id ? 'تعديل الفرع' : 'إضافة فرع'}
            </h2>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
              >
                <X size={13} />
                إلغاء التعديل
              </button>
            )}
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              اسم الفرع
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text"
                placeholder="الفرع الرئيسي"
              />
            </label>
            <label className="text-xs text-muted">
              المنطقة الزمنية
              <input
                value={form.timezone}
                onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text"
                placeholder="Asia/Riyadh"
              />
            </label>
            <label className="text-xs text-muted">
              الهاتف
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text"
                placeholder="+966..."
              />
            </label>
            <label className="text-xs text-muted">
              العنوان
              <input
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text"
                placeholder="الرياض، حي العليا"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={pending || !form.name.trim()}
            onClick={() => run(() => saveLocationAction(form), true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            {form.id ? 'حفظ التعديلات' : 'إضافة الفرع'}
          </button>
        </section>
      )}
    </div>
  )
}
