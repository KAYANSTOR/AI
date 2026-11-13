'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { sendHumanReplyAction } from './actions'

export function ReplyComposer({
  conversationId,
  closed,
}: {
  conversationId: string
  closed: boolean
}) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  if (closed) {
    return (
      <p className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-text-muted">
        المحادثة مغلقة. استخدم «إعادة فتح» قبل إرسال رد.
      </p>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        const body = text.trim()
        if (!body || pending) return
        setFeedback(null)
        start(async () => {
          const res = await sendHumanReplyAction(conversationId, body)
          if (res.ok) {
            setText('')
            setFeedback({ ok: true, text: res.message ?? 'تم الإرسال.' })
          } else {
            setFeedback({ ok: false, text: res.error ?? 'تعذّر الإرسال.' })
          }
        })
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رداً للعميل…"
          disabled={pending}
          className="h-11 flex-1 rounded-full border border-transparent bg-surface-muted px-4 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary/40 disabled:opacity-60"
          aria-label="نص الرد"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-95 disabled:opacity-50"
          aria-label="إرسال الرد"
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5 rtl:-scale-x-100" />
          )}
        </button>
      </div>
      {feedback ? (
        <p className={`text-xs ${feedback.ok ? 'text-success' : 'text-error'}`} role="status">
          {feedback.text}
        </p>
      ) : null}
    </form>
  )
}
