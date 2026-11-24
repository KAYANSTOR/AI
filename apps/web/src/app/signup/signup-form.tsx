'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { signUpAction } from '@/lib/auth/actions'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth/messages'
import { FormError, TextField, submitClass } from '@/components/auth/field'
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '@/lib/capabilities/business-types'
import { SectorPicker } from '@/components/ui/sector-picker'
import { PhoneField } from '@/components/auth/phone-field'
import { DEFAULT_COUNTRY, toE164 } from '@/lib/phone/arab-countries'
import { AuthProviderNotice } from '@/components/auth/provider-notice'
import { OAuthButtons } from '@/components/auth/oauth-buttons'

const MIN_PASSWORD_LENGTH = 8

export function SignupForm({ authConfigured, oauthError = null, oauthProvider = null }: { authConfigured: boolean; oauthError?: string | null; oauthProvider?: string | null }) {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState<string>(DEFAULT_BUSINESS_TYPE)
  const [identityMethod, setIdentityMethod] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial)
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!authConfigured) return <AuthProviderNotice />

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await signUpAction({
          companyName,
          businessTypeId: businessType,
          email: identityMethod === 'email' ? email : undefined,
          phone: identityMethod === 'phone' ? (toE164(dial, phone) ?? phone) : undefined,
          password,
          acceptedTerms,
        })
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
      <OAuthButtons mode="signup" error={oauthError} provider={oauthProvider} />
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
        <p className="mb-1.5 block text-sm font-medium text-text">نوع النشاط</p>
        <SectorPicker id="businessType" name="businessType" value={businessType} onChange={setBusinessType} />
        {hint ? <p className="mt-1.5 text-xs leading-6 text-text-muted">{hint}</p> : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-text">طريقة تسجيل الدخول</legend>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-muted p-1">
          <button
            type="button"
            aria-pressed={identityMethod === 'email'}
            onClick={() => setIdentityMethod('email')}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${identityMethod === 'email' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            البريد الإلكتروني
          </button>
          <button
            type="button"
            aria-pressed={identityMethod === 'phone'}
            onClick={() => setIdentityMethod('phone')}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${identityMethod === 'phone' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            رقم الهاتف
          </button>
        </div>
        {identityMethod === 'email' ? (
          <TextField
            id="email"
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="name@company.com"
          />
        ) : (
          <PhoneField
            id="phone"
            label="رقم الهاتف"
            dial={dial}
            onDialChange={setDial}
            value={phone}
            onChange={setPhone}
            hint="اختر رمز الدولة ثم اكتب رقمك بدون الصفر. لن نرسل رسالة نصية أو رمز تحقق."
          />
        )}
      </fieldset>

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

      <label className="flex items-start gap-3 text-sm leading-6 text-text-muted">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          required
          className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
        />
        <span>
          أوافق على <Link href="/terms" target="_blank" className="font-semibold text-secondary underline">شروط الاستخدام</Link>
          {' '}و<Link href="/privacy" target="_blank" className="font-semibold text-secondary underline">سياسة الخصوصية</Link>.
        </span>
      </label>

      <button type="submit" disabled={pending || !acceptedTerms} className={submitClass}>
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
