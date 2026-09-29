'use client'

import { useState, useTransition } from 'react'
import { toggleCapabilityAction } from './actions'
import { Loader2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'

type Row = {
  id: string
  name: string
  description: string | null
  enabled: boolean
}

export function CapabilityManager({ rows }: { rows: Row[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onToggle(id: string, enabled: boolean) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      try {
        await toggleCapabilityAction(id, enabled)
      } catch {
        setError(ar.errors.save)
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-text">
          {error}
        </div>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">{r.name}</p>
              {r.description && (
                <p className="mt-0.5 text-xs text-text-muted">{r.description}</p>
              )}
            </div>
            <button
              type="button"
              disabled={pending && pendingId === r.id}
              onClick={() => onToggle(r.id, !r.enabled)}
              className={`relative inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                r.enabled ? 'bg-primary-dark' : 'bg-border'
              }`}
              aria-pressed={r.enabled}
              aria-label={r.name}
            >
              {pending && pendingId === r.id ? (
                <Loader2 className="absolute inset-0 m-auto animate-spin text-surface" size={14} />
              ) : (
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-surface shadow transition ${
                    r.enabled ? 'rtl:-translate-x-5 ltr:translate-x-5' : 'translate-x-0'
                  }`}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        {ar.settings.capabilitySaved}
      </p>
    </div>
  )
}
