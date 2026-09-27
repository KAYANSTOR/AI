'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveBusinessSetup } from './actions'
import { CheckCircle2, Loader2 } from 'lucide-react'

type BusinessType = { id: string; name: string; description: string | null }
type CapRow = { id: string; name: string; description: string | null; is_default: boolean }

export function SetupForm({
  types,
  initialTypeId,
  capsByType,
  enabledIds,
}: {
  types: BusinessType[]
  initialTypeId: string | null
  capsByType: Record<string, CapRow[]>
  enabledIds: string[]
}) {
  const router = useRouter()
  const [typeId, setTypeId] = useState(initialTypeId ?? types[0]?.id ?? 'appointments')
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (enabledIds.length) return new Set(enabledIds)
    const defaults = (capsByType[typeId] ?? []).filter((c) => c.is_default).map((c) => c.id)
    return new Set(defaults)
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const caps = useMemo(() => capsByType[typeId] ?? [], [capsByType, typeId])

  function onTypeChange(id: string) {
    setTypeId(id)
    const defaults = (capsByType[id] ?? []).filter((c) => c.is_default).map((c) => c.id)
    setSelected(new Set(defaults))
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('business_type_id', typeId)
    selected.forEach((id) => fd.append('capability_id', id))
    startTransition(async () => {
      try {
        await saveBusinessSetup(fd)
        router.push('/dashboard')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">1. Choose your business type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {types.map((t) => {
            const active = typeId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTypeChange(t.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{t.name}</p>
                  {active && <CheckCircle2 className="text-indigo-600 shrink-0" size={18} />}
                </div>
                {t.description && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.description}</p>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">2. Enable capabilities</h2>
        <p className="text-xs text-slate-500 mb-3">
          Only enabled modules appear in the dashboard and to the AI tools registry.
        </p>
        <ul className="space-y-2">
          {caps.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <input
                id={`cap-${c.id}`}
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor={`cap-${c.id}`} className="cursor-pointer">
                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                {c.description && (
                  <span className="block text-xs text-slate-500 mt-0.5">{c.description}</span>
                )}
              </label>
            </li>
          ))}
          {!caps.length && (
            <li className="text-sm text-slate-400">No capabilities defined for this type.</li>
          )}
        </ul>
      </section>

      <button
        type="submit"
        disabled={pending || !typeId}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending && <Loader2 className="animate-spin" size={16} />}
        Save business profile
      </button>
    </form>
  )
}
