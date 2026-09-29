'use client'

import { useState, useTransition } from 'react'
import { createCannedReplyAction } from './actions'

export function CreateCannedReplyForm() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        setMessage(null)
        start(async () => {
          const res = await createCannedReplyAction({ title, body, shortcut })
          if (res.ok) {
            setTitle('')
            setBody('')
            setShortcut('')
            setMessage('تم الحفظ.')
          } else {
            setMessage(res.error)
          }
        })
      }}
    >
      <h2 className="text-sm font-semibold text-text">إضافة رد جاهز</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="العنوان"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        required
      />
      <input
        value={shortcut}
        onChange={(e) => setShortcut(e.target.value)}
        placeholder="اختصار (اختياري)"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="نص الرد"
        rows={4}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'جارٍ الحفظ…' : 'حفظ'}
      </button>
      {message && <p className="text-sm text-text-muted">{message}</p>}
    </form>
  )
}
