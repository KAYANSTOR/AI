'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { signUpAction } from '@/lib/auth/actions'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth/messages'
import { FormError, TextField, inputClass, submitClass } from '@/components/auth/field'
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '@/lib/capabilities/business-types'
import { AuthProviderNotice } from '@/components/auth/provider-notice'

const MIN_PASSWORD_LENGTH = 8

export function SignupForm({ authConfigured }: { authConfigured: boolean }) {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState<string>(DEFAULT_BUSINESS_TYPE)
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
        const result = await signUpAction({ companyName, businessTypeId: businessType, email, password })
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

  const hint = BUSINESS_TYPES.find((type) => type.id === businessType)?.hint

  return (
    <form className="space-y-5" method="post" onSubmit={onSubmit}>
      <FormError message={error} />

      <TextField
        id="companyName"
        label="اسم الشركة"
        value={companyName}
        onChange={setCompanyName}
        autoComplete="organization"
        placeholder="مثال: عيادات النخبة"
      />

      <div>
        <label htmlFor="businessType" className="block text-sm font-medium text-text">
          نوع النشاط
        </label>
        <select
          id="businessType"
          name="businessType"
          value={businessType}
          onChange={(event) => setBusinessType(event.target.value)}
          className={`${inputClass} mt-1.5`}
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        {hint ? <p className="mt-1.5 text-xs leading-6 text-text-muted">{hint}</p> : null}
      </div>

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
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`${MIN_PASSWORD_LENGTH} أحرف على الأقل.`}
      />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
        {pending ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
      </button>

      <p className="text-center text-sm text-text-muted">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-semibold text-secondary hover:text-secondary">
          تسجيل الدخول
        </Link>
      </p>
    </form>
  )
}
