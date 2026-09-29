'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function InboxSearchForm({
  initialQ,
  unreadOnly,
  view,
}: {
  initialQ: string
  unreadOnly: boolean
  view: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const sp = new URLSearchParams()
        if (view && view !== 'all') sp.set('view', view)
        if (q.trim()) sp.set('q', q.trim())
        if (unreadOnly) sp.set('unread', '1')
        const s = sp.toString()
        router.push(s ? `/dashboard/conversations?${s}` : '/dashboard/conversations')
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث بالاسم أو الهاتف…"
        className="min-w-[200px] flex-1 rounded-lg border border-border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        بحث
      </button>
    </form>
  )
}
