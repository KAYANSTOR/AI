'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NETWORK_ERROR_MESSAGE, translateAuthError } from '@/lib/auth/messages'
import { TextField } from '@/components/auth/field'
import { AuthProviderNotice } from '@/components/auth/provider-notice'

export function LoginForm({ returnTo, authConfigured }: { returnTo: string; authConfigured: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError(translateAuthError(signInError.message))
        setLoading(false)
        return
      }

      router.replace(returnTo)
      router.refresh()
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setLoading(false)
    }
  }

  if (!authConfigured) {
    return <AuthProviderNotice />
  }

  return (
    <form className="space-y-5" method="post" onSubmit={onSubmit}>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3"
        >
          <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
          <p className="text-sm font-medium text-text">{error}</p>
        </div>
      ) : null}

      <TextField
        id="email"
        label="بريد العمل"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@company.com"
      />

      <TextField
        id="password"
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="••••••••"
      />

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-dark px-4 py-3 text-sm font-semibold text-surface transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
        {loading ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
      </button>

      <p className="text-center text-sm text-text-muted">
        ليس لديك حساب؟{' '}
        <Link
          href="/signup"
          className="font-semibold text-primary-dark underline decoration-primary-light decoration-2 underline-offset-4 hover:decoration-primary-dark"
        >
          إنشاء حساب للشركة
        </Link>
      </p>
    </form>
  )
}
