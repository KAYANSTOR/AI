import { AlertCircle } from 'lucide-react'
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

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.27-.87-2.29-3.46zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.56-1.23z" />
    </svg>
  )
}

/** «المتابعة عبر Google / Apple». Full navigations to the OAuth start route. */
export function OAuthButtons({ mode, returnTo, error, provider }: { mode: 'login' | 'signup'; returnTo?: string; error?: string | null; provider?: string | null }) {
  const query = (p: string) => {
    const params = new URLSearchParams({ mode })
    if (returnTo) params.set('returnTo', returnTo)
    return `/api/auth/oauth/${p}?${params.toString()}`
  }
  const message = oauthErrorMessage(error, provider)
  return (
    <div className="space-y-3">
      {message ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-text">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}
      <a href={query('google')} className={buttonClass} data-testid="oauth-google">
        <GoogleIcon />
        <span>المتابعة عبر Google</span>
      </a>
      <a href={query('apple')} className={buttonClass} data-testid="oauth-apple">
        <AppleIcon />
        <span>المتابعة عبر Apple</span>
      </a>
      {mode === 'signup' ? (
        <p className="text-center text-xs leading-5 text-text-muted">
          بالمتابعة عبر Google أو Apple فإنك توافق على <a href="/terms" className="font-semibold text-secondary underline">الشروط</a> و<a href="/privacy" className="font-semibold text-secondary underline">سياسة الخصوصية</a>.
        </p>
      ) : null}
      <div className="relative py-1" aria-hidden="true">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-3 text-xs font-medium text-text-muted">أو بالبريد / الهاتف</span></div>
      </div>
    </div>
  )
}
