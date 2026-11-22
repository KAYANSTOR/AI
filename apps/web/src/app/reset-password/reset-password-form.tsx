'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completePasswordResetAction } from '@/lib/auth/actions'
import { FormError, TextField, submitClass } from '@/components/auth/field'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }
    startTransition(async () => {
      const result = await completePasswordResetAction({ token, password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.replace('/login?passwordReset=1')
      router.refresh()
    })
  }

  if (!token) {
    return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-text">رابط الاستعادة غير مكتمل. اطلب رابطاً جديداً.</p>
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <TextField id="password" label="كلمة المرور الجديدة" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} required hint="8 أحرف على الأقل." />
      <TextField id="confirmPassword" label="تأكيد كلمة المرور" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={8} required />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
        حفظ كلمة المرور الجديدة
      </button>
      <p className="text-center text-sm text-text-muted"><Link href="/login" className="font-semibold text-secondary underline">العودة إلى تسجيل الدخول</Link></p>
    </form>
  )
}
