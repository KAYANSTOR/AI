import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { oauthErrorMessage } from '@/lib/auth/oauth/messages'

const buttonClass =
  'flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text transition hover:border-secondary/40 hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12s4.15 9.25 9.25 9.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51z" />
    </svg>
  )
}

/** «المتابعة عبر Google». Full navigation to the Google OAuth start route. */
export function OAuthButtons({ mode, returnTo, error, provider }: { mode: 'login' | 'signup'; returnTo?: string; error?: string | null; provider?: string | null }) {
  const params = new URLSearchParams({ mode })
  if (returnTo) params.set('returnTo', returnTo)
  const googleHref = `/api/auth/oauth/google?${params.toString()}`
  const message = oauthErrorMessage(error, provider)
  return (
    <div className="space-y-3">
      {message ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-text">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}
      <a href={googleHref} className={buttonClass} data-testid="oauth-google">
        <GoogleIcon />
        <span>المتابعة عبر Google</span>
      </a>
      {mode === 'signup' ? (
        <p className="text-center text-xs leading-5 text-text-muted">
          بالمتابعة عبر Google فإنك توافق على <Link href="/terms" className="font-semibold text-secondary underline">الشروط</Link> و<Link href="/privacy" className="font-semibold text-secondary underline">سياسة الخصوصية</Link>.
        </p>
      ) : null}
      <div className="relative py-1" aria-hidden="true">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-3 text-xs font-medium text-text-muted">أو بالبريد / الهاتف</span></div>
      </div>
    </div>
  )
}
