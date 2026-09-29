'use client'

import { useState, useTransition } from 'react'
import { scheduleOutboundMessageAction } from './schedule-actions'

export function ScheduleMessageForm({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState('')
  const [when, setWhen] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="mt-4 space-y-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        setMsg(null)
        start(async () => {
          const res = await scheduleOutboundMessageAction({
            conversationId,
            body,
            scheduledAt: when,
          })
          if (res.ok) {
            setBody('')
            setMsg('تمت الجدولة. سيُرسل عبر outbox في الوقت المحدد.')
          } else {
            setMsg(res.error)
          }
        })
      }}
    >
      <p className="text-xs font-medium text-text">جدولة رد للعميل</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
        placeholder="نص الرسالة…"
        required
      />
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary-dark disabled:opacity-60"
      >
        {pending ? '…' : 'جدولة الإرسال'}
      </button>
      {msg && <p className="text-xs text-text-muted">{msg}</p>}
    </form>
  )
}
