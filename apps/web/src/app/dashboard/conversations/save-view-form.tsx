'use client'

import { useState, useTransition } from 'react'
import { saveInboxViewAction, type InboxFilters } from './views-actions'

export function SaveViewForm({ filters }: { filters: InboxFilters }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-text-muted"
      >
        + حفظ العرض
      </button>
    )
  }

  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await saveInboxViewAction({ name, filters })
          setMsg(res.ok ? 'تم' : res.error)
          if (res.ok) {
            setName('')
            setOpen(false)
          }
        })
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="اسم العرض"
        className="rounded border border-border px-2 py-1 text-xs"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
      >
        حفظ
      </button>
      <button type="button" className="text-xs text-text-muted" onClick={() => setOpen(false)}>
        إلغاء
      </button>
      {msg && <span className="text-xs text-text-muted">{msg}</span>}
    </form>
  )
}
