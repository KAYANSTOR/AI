'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, Loader2 } from 'lucide-react'

export function NotificationReadAction({
  notificationId,
  unreadCount = 0,
}: {
  notificationId?: string
  unreadCount?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const markAll = notificationId === undefined

  if (markAll && unreadCount === 0) return null

  function markRead() {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markAll ? { all: true } : { id: notificationId }),
        })
        if (!response.ok) throw new Error('notifications_failed')
        router.refresh()
      } catch {
        setError('تعذر تحديث الإشعار. حاول مرة أخرى.')
      }
    })
  }

  const label = markAll ? 'تعليم الكل كمقروء' : 'تعليم الإشعار كمقروء'

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={markRead}
        disabled={pending}
        aria-label={label}
        title={label}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-primary transition-colors hover:bg-primary-light/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 ${
          markAll ? 'px-3 text-sm font-semibold' : ''
        }`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : markAll ? (
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        {markAll ? <span>تعليم الكل كمقروء</span> : null}
      </button>
      {error ? <span role="alert" className="max-w-36 text-center text-[11px] text-error">{error}</span> : null}
    </div>
  )
}
