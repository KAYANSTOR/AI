import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isAuthConfigured } from '@/lib/auth/config'
import { SignupForm } from './signup-form'

export const metadata: Metadata = {
  title: 'إنشاء حساب للشركة',
  description:
    'أنشئ حساب شركتك في KAYAN AI، اختر نوع نشاطها، وابدأ إعداد الخدمات والقنوات وتفعيل الوكيل الذكي.',
}

export default function SignupPage() {
  const authConfigured = isAuthConfigured()

  return (
    <AuthShell
      title="إنشاء حساب للشركة"
      subtitle="أنشئ مساحة شركتك في دقيقة. نجهّز لك الوحدات المناسبة لنوع نشاطك، ويمكنك تعديلها لاحقًا."
    >
      <SignupForm authConfigured={authConfigured} />
    </AuthShell>
  )
}
