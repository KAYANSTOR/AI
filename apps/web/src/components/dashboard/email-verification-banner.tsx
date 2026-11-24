'use client'

import { useState, useTransition } from 'react'
import { Loader2, MailWarning } from 'lucide-react'
import { resendVerificationEmailAction } from '@/lib/auth/actions'

export function EmailVerificationBanner({ email }: { email: string }) {
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function resend() {
    setFeedback(null)
    startTransition(async () => {
      const result = await resendVerificationEmailAction().catch(() => ({ ok: false as const, error: 'تعذّر الاتصال. حاول مرة أخرى.' }))
      setFeedback(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })
    })
  }

  return (
    <div role="region" aria-label="تأكيد البريد الإلكتروني" className="rounded-2xl border border-accent/50 bg-accent/15 px-3 py-3 text-xs text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2 leading-5">
          <MailWarning size={18} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
          <span className="min-w-0">
            <strong className="block font-extrabold">أكّد بريدك الإلكتروني</strong>
            <span className="break-all text-text-muted">أرسلنا رابط تأكيد إلى <bdi dir="ltr">{email}</bdi>.</span>
          </span>
        </span>
        <button type="button" onClick={resend} disabled={pending} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary-dark px-3 py-2 font-bold text-primary disabled:opacity-60">
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          إعادة إرسال رابط التأكيد
        </button>
      </div>
      {feedback ? (
        <p role="status" aria-live="polite" className={`mt-2 leading-5 ${feedback.ok ? 'text-success' : 'text-error'}`}>{feedback.text}</p>
      ) : null}
    </div>
  )
}
