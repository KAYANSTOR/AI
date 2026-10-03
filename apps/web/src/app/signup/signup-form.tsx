'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NETWORK_ERROR_MESSAGE, translateAuthError } from '@/lib/auth/messages'
import { TextField } from '@/components/auth/field'
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '@/lib/capabilities/business-types'
import { AuthProviderNotice } from '@/components/auth/provider-notice'

// The FastPath lives at /onboarding; /dashboard/setup is only a compatibility redirect.
const ONBOARDING_DESTINATION = '/onboarding'

export function SignupForm({ authConfigured }: { authConfigured: boolean }) {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState<string>(DEFAULT_BUSINESS_TYPE)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // 1. Create and auto-confirm account via server API to bypass email rate limits
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          companyName: companyName.trim(),
          businessTypeId: businessType,
        }),
      })

      const registerData = await registerRes.json().catch(() => ({}))

      if (!registerRes.ok) {
        if (registerRes.status === 409 || registerData.error === 'user_already_registered') {
          setError('هذا البريد مسجّل بالفعل. يمكنك تسجيل الدخول مباشرة.')
        } else {
          setError(registerData.message || translateAuthError(registerData.error))
        }
        setLoading(false)
        return
      }

      // 2. Immediately sign in with the newly created and auto-confirmed credentials
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        // Fallback: redirect to login if client cookie couldn't be set directly
        router.replace('/login?registered=1')
        return
      }

      // 3. User is signed in! Redirect to onboarding / dashboard
      router.replace(ONBOARDING_DESTINATION)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      setLoading(false)
    }
  }

  if (!authConfigured) {
    return <AuthProviderNotice />
  }

  if (awaitingConfirmation) {
    return (
      <div role="status" className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
          <MailCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
          <div className="text-sm leading-7 text-text">
            <p className="font-semibold">أرسلنا رابط تأكيد إلى {email}</p>
            <p className="mt-1">بعد تأكيد البريد ستنتقل مباشرة إلى تجهيز نشاطك، وتكمل من حيث توقفت.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary-dark px-4 py-3 text-sm font-semibold text-surface transition-colors hover:bg-primary"
          >
            الذهاب إلى تسجيل الدخول
          </Link>
          <button
            type="button"
            onClick={() => setAwaitingConfirmation(false)}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text transition-colors hover:border-primary-dark hover:text-primary-dark"
          >
            تعديل البيانات
          </button>
        </div>
      </div>
    )
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
        id="companyName"
        label="اسم الشركة"
        value={companyName}
        onChange={setCompanyName}
        autoComplete="organization"
        placeholder="مثال: روائع الأعراس"
      />

      <div>
        <label htmlFor="businessType" className="block text-sm font-semibold text-text">
          نوع نشاط الشركة
        </label>
        <select
          id="businessType"
          name="businessType"
          value={businessType}
          onChange={(event) => setBusinessType(event.target.value)}
          className="mt-2 block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text shadow-sm outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs leading-6 text-text-muted">
          {BUSINESS_TYPES.find((type) => type.id === businessType)?.hint}
          {' — يمكنك تغيير النشاط والوحدات لاحقًا من إعدادات الشركة.'}
        </p>
      </div>

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
        autoComplete="new-password"
        placeholder="••••••••"
        minLength={6}
        hint="٦ أحرف على الأقل."
      />

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-dark px-4 py-3 text-sm font-semibold text-surface transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
        {loading ? 'جارٍ إنشاء الحساب…' : 'إنشاء حساب للشركة'}
      </button>

      <p className="text-center text-sm text-text-muted">
        لديك حساب بالفعل؟{' '}
        <Link
          href="/login"
          className="font-semibold text-primary-dark underline decoration-primary-light decoration-2 underline-offset-4 hover:decoration-primary-dark"
        >
          تسجيل الدخول
        </Link>
      </p>
    </form>
  )
}
