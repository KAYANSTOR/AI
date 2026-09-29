'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { updateLeadStatusAction } from './actions'
import { LEAD_STATUSES } from '@/lib/leads'

const LABELS: Record<string, string> = {
  new: 'جديد',
  qualified: 'مؤهل',
  contacted: 'تم التواصل',
  booked: 'محجوز',
  waiting: 'انتظار',
  won: 'فوز',
  lost: 'خسارة',
  recovered: 'استعادة',
}

export function LeadStatusControl({
  leadId,
  status,
  canEdit,
}: {
  leadId: string
  status: string
  canEdit: boolean
}) {
  const [value, setValue] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!canEdit) {
    return <span className="text-xs text-text-muted">{LABELS[status] ?? status}</span>
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-text"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          setError(null)
          startTransition(async () => {
            const result = await updateLeadStatusAction({ leadId, nextStatus: next })
            if (!result.ok) {
              setError(result.error)
              setValue(status)
              return
            }
            setValue(next)
          })
        }}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LABELS[s] ?? s}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
      {error && <span className="text-[11px] text-error">{error}</span>}
    </div>
  )
}
