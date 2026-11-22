'use client'

import { useState, useTransition } from 'react'
import { Bot, Check, CheckCircle2, ChevronDown, Loader2, MessageSquarePlus, UserCheck, X } from 'lucide-react'
import {
  addNoteAction,
  closeConversationAction,
  reopenConversationAction,
  resumeAiAction,
  takeOverAction,
  type InboxResult,
} from './actions'
import { ScheduleMessageForm } from './schedule-form'

export function InboxControls({
  conversationId,
  status,
  aiEnabled,
}: {
  conversationId: string
  status: string
  aiEnabled: boolean
}) {
  const [result, setResult] = useState<InboxResult | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  function run(work: () => Promise<InboxResult>, clearNote = false) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
      if (outcome.ok && clearNote) setNote('')
    })
  }

  const closed = status === 'closed'
  const handedOff = status === 'handed_off'
  const actionClass = 'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${closed ? 'bg-error/10 text-error' : 'bg-primary-light text-secondary'}`}>
          <span className={`h-2 w-2 rounded-full ${closed ? 'bg-error' : 'bg-success'}`} />
          {closed ? 'مغلقة' : handedOff ? 'بانتظار الفريق' : 'مفتوحة'}
        </span>

        {!closed && !handedOff && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => takeOverAction(conversationId))}
            className={`${actionClass} border-secondary/20 bg-surface text-text hover:bg-surface-muted`}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
            استلام
          </button>
        )}

        {handedOff && !closed && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resumeAiAction(conversationId))}
            className={`${actionClass} border-secondary/20 bg-surface text-text hover:bg-surface-muted`}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            إعادة تفعيل المساعد
          </button>
        )}

        {closed ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenConversationAction(conversationId))}
            className={`${actionClass} border-success/30 bg-success/10 text-text hover:bg-success/15`}
          >
            <Check className="h-3.5 w-3.5" /> إعادة فتح
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => closeConversationAction(conversationId))}
            className={`${actionClass} border-border bg-surface text-text-muted hover:border-error/40 hover:text-error`}
          >
            <X className="h-3.5 w-3.5" /> إغلاق
          </button>
        )}

        <details className="group relative ms-auto shrink-0">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-text-muted hover:bg-surface-muted">
            المزيد <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="absolute end-0 top-11 z-30 w-[min(86vw,320px)] rounded-2xl border border-border bg-surface p-3 shadow-raised">
            <label className="block text-xs font-semibold text-text-muted">
              ملاحظة داخلية
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-secondary/40"
                placeholder="أضف ملاحظة للفريق..."
              />
            </label>
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() => run(() => addNoteAction(conversationId, note), true)}
              className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
              حفظ الملاحظة
            </button>
            {!closed && <div className="mt-3 border-t border-border pt-3"><ScheduleMessageForm conversationId={conversationId} /></div>}
          </div>
        </details>
      </div>

      {result && (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-xs ${result.ok ? 'border-success/30 bg-success/10 text-text' : 'border-error/30 bg-error/10 text-text'}`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-text-muted">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
        عند استلام المحادثة يتوقف المساعد الذكي حتى إعادة تفعيله
        <span className="sr-only">{aiEnabled ? 'المساعد مفعّل حالياً' : 'المساعد متوقف حالياً'}</span>
      </p>
    </div>
  )
}
