'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { changePasswordAction } from '@/lib/auth/actions'
import { FormError, TextField } from '@/components/auth/field'

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setDone(false)
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setDone(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={error} />
        {done ? (
          <p role="status" className="rounded-xl border border-success/30 bg-success/[0.07] px-4 py-3 text-sm font-medium text-success">
            تم تغيير كلمة المرور، وسُجّل خروج الأجهزة الأخرى.
          </p>
        ) : null}
      </div>
      <TextField
        id="currentPassword"
        label="كلمة المرور الحالية"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <TextField
        id="newPassword"
        label="كلمة المرور الجديدة"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        minLength={8}
        hint="8 أحرف على الأقل."
      />
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          تحديث كلمة المرور
        </button>
      </div>
    </form>
  )
}
