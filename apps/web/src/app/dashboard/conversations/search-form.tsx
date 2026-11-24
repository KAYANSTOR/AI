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
        router.replace(s ? `/dashboard/conversations?${s}` : '/dashboard/conversations')
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث بالاسم أو الهاتف أو نص الرسالة…"
        aria-label="بحث في المحادثات"
        type="search"
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-base text-text sm:text-sm"
      />
      <button
        type="submit"
        className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        بحث
      </button>
    </form>
  )
}
