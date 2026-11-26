import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isAuthConfigured } from '@/lib/auth/config'
import { SignupForm } from './signup-form'

export const metadata: Metadata = {
  title: 'إنشاء حساب',
  robots: { index: false, follow: false },
  description:
    'أنشئ حسابك في KAYAN AI، اختر نوع نشاطك، وأكمل إعداد الخدمات والقنوات وتفعيل الوكيل الذكي.',
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const authConfigured = isAuthConfigured()
  const oauthError = typeof params.oauthError === 'string' ? params.oauthError : null
  const oauthProvider = typeof params.provider === 'string' ? params.provider : null

  return (
    <AuthShell
      title="إنشاء حساب جديد"
      subtitle="سجّل دخولك أو أنشئ حسابك في دقيقة، ثم أدخل اسم شركتك وأكمل الإعداد."
    >
      <SignupForm authConfigured={authConfigured} oauthError={oauthError} oauthProvider={oauthProvider} />
    </AuthShell>
  )
}
