'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { sendHumanReplyAction } from './actions'
import { emitInboxOptimistic } from '@/lib/inbox/optimistic-events'

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
      <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-center text-xs text-text-muted">
        هذه المحادثة مغلقة. أعد فتحها لإرسال رد جديد.
      </div>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        const body = text.trim()
        if (!body || pending) return
        setFeedback(null)
        // Show the bubble immediately; the server-confirmed row replaces it without a refresh.
        const clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
        emitInboxOptimistic({ kind: 'append', conversationId, clientId, content: body, createdAt: new Date().toISOString() })
        setText('')
        start(async () => {
          try {
            const response = await sendHumanReplyAction(conversationId, body)
            if (response.ok) {
              emitInboxOptimistic({ kind: 'confirm', conversationId, clientId, confirmed: response.confirmed ?? null, delivery: response.delivery ?? 'queued' })
            } else {
              emitInboxOptimistic({ kind: 'fail', conversationId, clientId })
              setText((current) => current || body)
              setFeedback({ ok: false, text: response.error ?? 'تعذّر الإرسال.' })
            }
          } catch {
            emitInboxOptimistic({ kind: 'fail', conversationId, clientId })
            setText((current) => current || body)
            setFeedback({ ok: false, text: 'تعذّر الاتصال. حاول مرة أخرى.' })
          }
        })
      }}
    >
      <div className="flex items-end gap-2 rounded-[22px] border border-border bg-background p-2 shadow-sm transition focus-within:border-secondary/35">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="اكتب رداً..."
          disabled={pending}
          rows={1}
          className="max-h-28 min-h-11 min-w-0 flex-1 resize-y bg-transparent px-2 py-2.5 text-sm leading-6 text-text outline-none placeholder:text-text-muted disabled:opacity-60"
          aria-label="نص الرد"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-95 disabled:opacity-45"
          aria-label="إرسال الرد"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rtl:-scale-x-100" />}
        </button>
      </div>
      <div className="flex items-center justify-between px-2 text-[10px] text-text-muted">
        <span>Enter للإرسال · Shift + Enter لسطر جديد</span>
        <span>{text.length > 0 ? `${text.length} حرف` : 'الرد سيُرسل باسم فريق العمل'}</span>
      </div>
      {feedback && (
        <p className={`px-2 text-xs ${feedback.ok ? 'text-success' : 'text-error'}`} role="status">
          {feedback.text}
        </p>
      )}
    </form>
  )
}
