'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react'
import { verifyEmailAction } from '@/lib/auth/actions'
import { submitClass } from '@/components/auth/field'

/**
 * Verification is a POST (server action) triggered by the user, so mail scanners that
 * prefetch the GET link cannot burn the single-use token.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'invalid'>(token ? 'idle' : 'invalid')
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await verifyEmailAction({ token }).catch(() => ({ ok: false }))
      setStatus(result.ok ? 'ok' : 'invalid')
    })
  }

  if (status === 'ok') {
    return (
      <div role="status" className="space-y-4 rounded-xl border border-success/30 bg-success/[0.07] p-4 text-sm leading-7 text-text">
        <CheckCircle2 className="text-success" size={24} aria-hidden="true" />
        <p>تم تأكيد بريدك الإلكتروني بنجاح.</p>
        <Link href="/dashboard" className={submitClass}>الذهاب إلى لوحة التحكم</Link>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div role="alert" className="space-y-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-7 text-text">
        <MailWarning className="text-warning" size={24} aria-hidden="true" />
        <p>الرابط غير صالح أو استُخدم من قبل أو انتهت صلاحيته (24 ساعة). اطلب رابطاً جديداً من لوحة التحكم.</p>
        <Link href="/dashboard" className="font-semibold text-secondary underline">العودة إلى لوحة التحكم</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-text-muted">اضغط الزر لتأكيد أن هذا البريد يخصك.</p>
      <button type="button" onClick={confirm} disabled={pending} className={submitClass}>
        {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
        تأكيد بريدي الإلكتروني
      </button>
    </div>
  )
}
