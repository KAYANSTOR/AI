'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleCapabilityAction } from './actions'
import { Loader2 } from 'lucide-react'

type Row = {
  id: string
  name: string
  description: string | null
  enabled: boolean
}

export function CapabilityManager({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onToggle(id: string, enabled: boolean) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      try {
        await toggleCapabilityAction(id, enabled)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
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
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{r.name}</p>
              {r.description && (
                <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
              )}
            </div>
            <button
              type="button"
              disabled={pending && pendingId === r.id}
              onClick={() => onToggle(r.id, !r.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                r.enabled ? 'bg-primary-dark' : 'bg-slate-200'
              }`}
              aria-pressed={r.enabled}
            >
              {pending && pendingId === r.id ? (
                <Loader2 className="absolute inset-0 m-auto animate-spin text-white" size={14} />
              ) : (
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    r.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Changes apply immediately to navigation and AI tool registry.
      </p>
    </div>
  )
}
