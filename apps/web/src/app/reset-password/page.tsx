import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from './reset-password-form'

export const metadata: Metadata = {
  title: 'تعيين كلمة مرور جديدة',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  return (
    <AuthShell title="تعيين كلمة مرور جديدة" subtitle="اختر كلمة مرور قوية لحماية حساب شركتك.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  )
}
