'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { signInAction } from '@/lib/auth/actions'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth/messages'
import { AuthProviderNotice } from '@/components/auth/provider-notice'
import { FormError, TextField, submitClass, secondaryButtonClass } from '@/components/auth/field'

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
    <form className="space-y-4" method="post" onSubmit={onSubmit} noValidate={false}>
      <FormError message={error} />

      <div className="space-y-3.5">
        <TextField
          id="email"
          label="البريد الإلكتروني"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="name@company.com"
          trailingIcon={<Mail size={18} className="text-text-muted" />}
        />

        <TextField
          id="password"
          label="كلمة المرور"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••••"
          trailingIcon={<Lock size={18} className="text-text-muted" />}
        />
      </div>

      <div className="pt-2">
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              <span>جارٍ التحقق…</span>
            </>
          ) : (
            <>
              <span>تسجيل الدخول</span>
              <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs font-medium text-text-muted">أو</span>
        </div>
      </div>

      <Link href="/signup" className={secondaryButtonClass}>
        إنشاء حساب للشركة
      </Link>

      <div className="flex items-center justify-center gap-1.5 pt-4 text-xs font-medium text-text-muted">
        <ShieldCheck size={16} className="text-secondary shrink-0" aria-hidden="true" />
        <span>بيانات شركتك معزولة ومحمية</span>
      </div>
    </form>
  )
}
