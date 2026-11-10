'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { signInAction } from '@/lib/auth/actions'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth/messages'
import { AuthProviderNotice } from '@/components/auth/provider-notice'
import { FormError, TextField, submitClass } from '@/components/auth/field'

export function LoginForm({ returnTo, authConfigured }: { returnTo: string; authConfigured: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!authConfigured) return <AuthProviderNotice />

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await signInAction({ email, password, returnTo })
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.replace(result.redirectTo)
        router.refresh()
      } catch {
        setError(NETWORK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <form className="space-y-5" method="post" onSubmit={onSubmit} noValidate={false}>
      <FormError message={error} />

      <TextField
        id="email"
        label="البريد الإلكتروني"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="name@company.com"
      />

      <TextField
        id="password"
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
        {pending ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
      </button>

      <p className="text-center text-sm text-text-muted">
        ليس لديك حساب؟{' '}
        <Link href="/signup" className="font-semibold text-secondary hover:text-secondary">
          أنشئ حساب شركتك
        </Link>
      </p>
    </form>
  )
}
