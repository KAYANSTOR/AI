import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isAuthConfigured } from '@/lib/auth/config'
import { isPasswordRecoveryConfigured } from '@/lib/auth/password-recovery'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = {
  title: 'استعادة كلمة المرور',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  const enabled = isAuthConfigured() && isPasswordRecoveryConfigured()
  return (
    <AuthShell title="استعادة كلمة المرور" subtitle="أدخل بريدك المسجل وسنرسل رابطاً آمناً لإعادة تعيين كلمة المرور.">
      <ForgotPasswordForm enabled={enabled} />
    </AuthShell>
  )
}
