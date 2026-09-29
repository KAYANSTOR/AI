'use client'

import { useState, useTransition } from 'react'
import { Bot, CheckCircle2, Loader2, MessageSquarePlus, UserCheck } from 'lucide-react'
import {
  addNoteAction,
  closeConversationAction,
  reopenConversationAction,
  resumeAiAction,
  takeOverAction,
  type InboxResult,
} from './actions'

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
      if (outcome.ok) {
        if (clearNote) setNote('')
      }
    })
  }

  const closed = status === 'closed'
  const handedOff = status === 'handed_off'

  return (
    <div className="space-y-3">
      {result && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            result.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!handedOff && !closed && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => takeOverAction(conversationId))}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 md:text-sm"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <UserCheck size={14} />}
            استلام المحادثة
          </button>
        )}

        {handedOff && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resumeAiAction(conversationId))}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 md:text-sm"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <Bot size={14} />}
            إعادة الوكيل
          </button>
        )}

        {closed ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenConversationAction(conversationId))}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-base font-medium text-text transition-colors hover:border-primary/50 disabled:opacity-60 md:text-sm"
          >
            إعادة الفتح
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => closeConversationAction(conversationId))}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-base font-medium text-text transition-colors hover:border-error/40 hover:text-error disabled:opacity-60 md:text-sm"
          >
            إغلاق المحادثة
          </button>
        )}

        <span className="text-xs text-text-muted">
          {closed ? 'مغلقة' : aiEnabled ? 'الوكيل يرد' : 'الوكيل متوقف'}
        </span>
      </div>

      <div>
        <label className="text-xs text-text-muted">
          ملاحظة داخلية (لا تُرسل للعميل)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
            placeholder="العميل يفضل الاتصال بعد الخامسة."
          />
        </label>
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => run(() => addNoteAction(conversationId, note), true)}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-3 py-1.5 text-base font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60 md:text-sm"
        >
          {pending ? <Loader2 className="animate-spin" size={14} /> : <MessageSquarePlus size={14} />}
          إضافة ملاحظة
        </button>
      </div>

      <p className="flex items-start gap-2 text-xs text-text-muted">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
        عند الاستلام يتوقف الوكيل فورًا، وتستمر رسائل العميل في نفس المحادثة بدل فتح محادثة جديدة.
      </p>
    </div>
  )
}
