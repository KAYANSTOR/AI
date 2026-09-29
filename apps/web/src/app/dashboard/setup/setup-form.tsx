'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveBusinessSetup } from './actions'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'
import { businessTypeHint, businessTypeLabel, capabilityDescription, capabilityLabel } from '@/lib/i18n/labels'

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
      } catch {
        setError(ar.errors.save)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">{ar.setup.chooseBusinessType}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {types.map((t) => {
            const active = typeId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTypeChange(t.id)}
                className={`min-h-11 text-start rounded-xl border p-4 transition-colors ${
                  active
                    ? 'border-primary-dark bg-primary-light/25 ring-2 ring-primary-light'
                    : 'border-border bg-surface hover:border-primary-light'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-text">{businessTypeLabel(t.id, t.name)}</p>
                  {active && <CheckCircle2 className="shrink-0 text-primary-dark" size={18} />}
                </div>
                {(businessTypeHint(t.id, t.description ?? undefined)) && (
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{businessTypeHint(t.id, t.description ?? undefined)}</p>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-text">{ar.setup.chooseCapabilities}</h2>
        <p className="mb-3 text-xs text-text-muted">{ar.setup.capabilityHint}</p>
        <ul className="space-y-2">
          {caps.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-surface px-4 py-2"
            >
              <label htmlFor={`cap-${c.id}`} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  id={`cap-${c.id}`}
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-5 w-5 shrink-0 rounded border-border text-primary-dark focus:ring-primary"
                />
                <span>
                  <span className="text-sm font-medium text-text">{capabilityLabel(c.id, c.name)}</span>
                  {(capabilityDescription(c.id, c.description ?? undefined)) && (
                    <span className="block text-xs text-text-muted">{capabilityDescription(c.id, c.description ?? undefined)}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
          {!caps.length && (
            <li className="text-sm text-text-muted">{ar.setup.noCapabilities}</li>
          )}
        </ul>
      </section>

      <button
        type="submit"
        disabled={pending || !typeId}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark px-5 py-2.5 text-base font-semibold text-surface shadow-sm transition-colors hover:bg-primary disabled:opacity-60 md:w-auto md:text-sm"
      >
        {pending && <Loader2 className="animate-spin" size={16} />}
        {pending ? ar.common.saving : ar.setup.save}
      </button>
    </form>
  )
}
