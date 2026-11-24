import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyEmailForm } from './verify-email-form'

export const metadata: Metadata = {
  title: 'تأكيد البريد الإلكتروني',
  robots: { index: false, follow: false },
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  return (
    <AuthShell title="تأكيد البريد الإلكتروني" subtitle="خطوة أخيرة لحماية حساب شركتك.">
      <VerifyEmailForm token={token} />
    </AuthShell>
  )
}
