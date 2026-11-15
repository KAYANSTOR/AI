import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isAuthConfigured } from '@/lib/auth/config'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
  description: 'سجّل الدخول إلى حساب شركتك في KAYAN AI للوصول إلى المحادثات والعملاء والمواعيد.',
}

const DEFAULT_DESTINATION = '/dashboard'

/** Only same-site absolute paths are accepted as a post-login destination. */
function sanitizeReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return DEFAULT_DESTINATION
  }
  return candidate
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const returnTo = sanitizeReturnTo(params.returnTo)
  const authConfigured = isAuthConfigured()

  return (
    <AuthShell
      title="تسجيل الدخول"
      subtitle="أهلًا بعودتك. ادخل إلى لوحة شركتك لمتابعة المحادثات والعملاء والمواعيد."
      hideFooterNotice
    >
      <LoginForm returnTo={returnTo} authConfigured={authConfigured} />
    </AuthShell>
  )
}
