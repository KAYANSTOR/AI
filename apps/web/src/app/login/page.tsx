import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  description: 'سجّل الدخول إلى حساب شركتك في FrontDesk AI للوصول إلى المحادثات والعملاء والمواعيد.',
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
  // يُقرأ وقت الطلب من بيئة التشغيل، لا وقت البناء.
  const authConfigured = isSupabaseConfigured()

  return (
    <AuthShell
      title="تسجيل الدخول"
      subtitle="ادخل إلى لوحة شركتك لمتابعة المحادثات والعملاء والمواعيد."
      footer={
        <p className="text-center text-xs leading-6 text-text-muted">
          لا تملك حسابًا بعد؟{' '}
          <a
            href="/signup"
            className="font-semibold text-primary-dark underline decoration-primary-light decoration-2 underline-offset-4"
          >
            أنشئ حساب شركتك
          </a>
        </p>
      }
    >
      <LoginForm returnTo={returnTo} authConfigured={authConfigured} />
    </AuthShell>
  )
}
