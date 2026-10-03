'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
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
  const [demoLoading, setDemoLoading] = useState(false)

  async function handleLogin(targetEmail: string, targetPass: string) {
    const supabase = createClient()
    let { error: signInError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: targetPass,
    })

    // If account was created before but unconfirmed, auto-confirm it and retry
    if (signInError && signInError.message.toLowerCase().includes('email not confirmed')) {
      try {
        await fetch('/api/auth/confirm-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetEmail }),
        })
        const retry = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: targetPass,
        })
        signInError = retry.error
      } catch {
        // Fall through
      }
    }

    if (signInError) {
      setError(translateAuthError(signInError.message))
      return false
    }

    router.replace(returnTo)
    return true
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const ok = await handleLogin(email.trim(), password)
      if (!ok) setLoading(false)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setLoading(false)
    }
  }

  async function onQuickDemoLogin() {
    setDemoLoading(true)
    setError(null)
    setEmail('demo@frontdesk.ai')
    setPassword('Password123!')

    try {
      const ok = await handleLogin('demo@frontdesk.ai', 'Password123!')
      if (!ok) setDemoLoading(false)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setDemoLoading(false)
    }
  }

  if (!authConfigured) {
    return <AuthProviderNotice />
  }

  return (
    <div className="space-y-6">
      {/* Quick Demo Login Card for local evaluation */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-start">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary shrink-0" />
            <span className="text-xs font-bold text-text">تسجيل دخول سريع للتجربة المحلية</span>
          </div>
          <button
            type="button"
            onClick={onQuickDemoLogin}
            disabled={demoLoading || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-xs"
          >
            {demoLoading && <Loader2 size={13} className="animate-spin" />}
            <span>دخول فوري بنقرة واحدة</span>
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1.5">
          حساب تجريبي مفعّل جاهز: <span className="font-mono text-text">demo@frontdesk.ai</span>
        </p>
      </div>

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
          disabled={loading || demoLoading}
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
    </div>
  )
}
