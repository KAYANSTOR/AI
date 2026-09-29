'use client'

import { useState, useTransition } from 'react'
import { Loader2, MapPin, Pencil, Plus, X } from 'lucide-react'
import { saveLocationAction, setLocationActiveAction, type LocationResult } from './actions'
import { ar } from '@/lib/i18n/ar'

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
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          {ar.locations.empty}
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
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">
                      {ar.locations.inactive}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {row.address || ar.locations.noDetails}
                  {row.metadata?.phone && <> · <span dir="ltr">{row.metadata.phone}</span></>}
                  {row.timezone && <> · <span dir="ltr">{row.timezone}</span></>}
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
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-primary-dark"
                    aria-label={ar.common.edit}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setLocationActiveAction(row.id, !row.is_active))}
                    className="min-h-11 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary/50"
                  >
                    {row.is_active ? ar.locations.disable : ar.locations.enable}
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
              {form.id ? ar.locations.editTitle : ar.locations.addTitle}
            </h2>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY)}
                className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted hover:text-text"
              >
                <X size={13} />
                {ar.locations.cancelEdit}
              </button>
            )}
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-text-muted">
              {ar.locations.name}
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder={ar.locations.mainBranch}
              />
            </label>
            <label className="text-xs text-text-muted">
              {ar.locations.timezone}
              <input
                value={form.timezone}
                onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                dir="ltr"
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder="Asia/Riyadh"
              />
            </label>
            <label className="text-xs text-text-muted">
              {ar.locations.phone}
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                dir="ltr"
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder="+966..."
              />
            </label>
            <label className="text-xs text-text-muted">
              {ar.locations.address}
              <input
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder="الرياض، حي العليا"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={pending || !form.name.trim()}
            onClick={() => run(() => saveLocationAction(form), true)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 md:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            {form.id ? ar.locations.saveEdit : ar.locations.add}
          </button>
        </section>
      )}
    </div>
  )
}
