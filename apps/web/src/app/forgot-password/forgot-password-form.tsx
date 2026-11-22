'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, MailCheck } from 'lucide-react'
import { requestPasswordResetAction } from '@/lib/auth/actions'
import { FormError, TextField, submitClass } from '@/components/auth/field'

export function ForgotPasswordForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await requestPasswordResetAction({ email })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSent(true)
    })
  }

  return (
    <div className="space-y-5">
      {sent ? (
        <div role="status" className="rounded-xl border border-success/30 bg-success/[0.07] p-4 text-sm leading-7 text-text">
          <MailCheck className="mb-2 text-success" size={22} aria-hidden="true" />
          إذا كان البريد مرتبطاً بحساب، فستصلك رسالة تحتوي على رابط إعادة التعيين. تحقق من صندوق الوارد والرسائل غير المرغوب فيها.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError message={error} />
          {!enabled ? (
            <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-text">
              خدمة إرسال رسائل الاستعادة غير مهيأة حالياً. لن نعرض نجاحاً وهمياً؛ يرجى التواصل مع الدعم مؤقتاً.
            </p>
          ) : null}
          <TextField
            id="email"
            label="البريد الإلكتروني المسجل"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
            placeholder="name@company.com"
          />
          <button type="submit" disabled={!enabled || pending} className={submitClass}>
            {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
            إرسال رابط الاستعادة
          </button>
        </form>
      )}
      <p className="text-center text-sm text-text-muted">
        <Link href="/login" className="font-semibold text-secondary underline">العودة إلى تسجيل الدخول</Link>
      </p>
    </div>
  )
}
