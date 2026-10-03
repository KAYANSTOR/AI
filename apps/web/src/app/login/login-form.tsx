'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Eye, EyeOff, Loader2, Sparkles, UserCheck, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NETWORK_ERROR_MESSAGE, translateAuthError } from '@/lib/auth/messages'
import { AuthProviderNotice } from '@/components/auth/provider-notice'

export function LoginForm({ returnTo, authConfigured }: { returnTo: string; authConfigured: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [quickLoading, setQuickLoading] = useState<string | null>(null)

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
    setSuccessNotice(null)

    try {
      const ok = await handleLogin(email.trim(), password)
      if (!ok) setLoading(false)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setLoading(false)
    }
  }

  async function onDirectLogin(targetEmail: string, targetPass: string, key: string) {
    setQuickLoading(key)
    setError(null)
    setSuccessNotice(null)
    setEmail(targetEmail)
    setPassword(targetPass)

    try {
      const ok = await handleLogin(targetEmail, targetPass)
      if (!ok) setQuickLoading(null)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setQuickLoading(null)
    }
  }

  async function onResetPasswordAndLogin() {
    const targetEmail = (email || 'jarallhalkboudi@gmail.com').trim()
    setLoading(true)
    setError(null)
    setSuccessNotice(null)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          newPassword: 'Password123!',
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'تعذّر إعادة تعيين كلمة المرور')
        setLoading(false)
        return
      }

      setSuccessNotice('تم تعيين كلمة المرور إلى Password123! وجارٍ تسجيل الدخول…')
      setEmail(targetEmail)
      setPassword('Password123!')

      const ok = await handleLogin(targetEmail, 'Password123!')
      if (!ok) setLoading(false)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setLoading(false)
    }
  }

  if (!authConfigured) {
    return <AuthProviderNotice />
  }

  return (
    <div className="space-y-6">
      {/* Quick Direct Sign-in options */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-start space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary shrink-0" />
          <span className="text-xs font-bold text-text">تسجيل دخول مباشر بنقرة واحدة</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* Main Owner Account */}
          <button
            type="button"
            onClick={() => onDirectLogin('jarallhalkboudi@gmail.com', 'Password123!', 'owner')}
            disabled={loading || quickLoading !== null}
            className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-xs"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <UserCheck size={14} className="shrink-0" />
              <span className="truncate">حسابك: jarallhalkboudi@gmail.com</span>
            </div>
            {quickLoading === 'owner' ? <Loader2 size={13} className="animate-spin" /> : <span>دخول</span>}
          </button>

          {/* Demo Account */}
          <button
            type="button"
            onClick={() => onDirectLogin('demo@frontdesk.ai', 'Password123!', 'demo')}
            disabled={loading || quickLoading !== null}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border bg-surface text-xs font-semibold text-text hover:border-primary-dark hover:text-primary-dark transition-colors disabled:opacity-50"
          >
            <span>حساب تجريبي (demo)</span>
            {quickLoading === 'demo' && <Loader2 size={13} className="animate-spin" />}
          </button>
        </div>
        <p className="text-[11px] text-text-muted">
          كلمة المرور الافتراضية للحساب: <span className="font-mono text-text font-semibold">Password123!</span>
        </p>
      </div>

      <form className="space-y-4" method="post" onSubmit={onSubmit}>
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3"
          >
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-text">{error}</p>
              <button
                type="button"
                onClick={onResetPasswordAndLogin}
                className="mt-1 text-xs font-bold text-primary-dark underline hover:text-primary flex items-center gap-1"
              >
                <KeyRound size={13} />
                <span>إعادة ضبط كلمة المرور إلى Password123! والدخول فوراً</span>
              </button>
            </div>
          </div>
        ) : null}

        {successNotice ? (
          <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-semibold text-text">
            {successNotice}
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-text">
            بريد العمل
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
            className="mt-1.5 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base text-text shadow-sm outline-none transition-colors placeholder:text-text-muted/70 focus:border-primary-dark focus:ring-2 focus:ring-primary-light md:text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-semibold text-text">
              كلمة المرور
            </label>
            <button
              type="button"
              onClick={onResetPasswordAndLogin}
              className="text-xs font-medium text-primary-dark hover:underline"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="block min-h-11 w-full rounded-xl border border-border bg-surface ps-3 pe-10 py-2.5 text-base text-text shadow-sm outline-none transition-colors placeholder:text-text-muted/70 focus:border-primary-dark focus:ring-2 focus:ring-primary-light md:text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors"
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || quickLoading !== null}
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
