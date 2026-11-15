import Link from 'next/link'

/** Shown on /login and /signup when the server is missing its database or session settings. */
export function AuthProviderNotice() {
  return (
    <div role="status" className="space-y-5">
      <div className="rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-4 text-sm leading-7 text-text">
        <p className="font-semibold">الخدمة غير مهيأة بعد</p>
        <p className="mt-1 text-text-muted">
          يحتاج الخادم إلى إعداد قاعدة البيانات ومفتاح الجلسات قبل تفعيل الدخول والتسجيل:
        </p>
        <ul className="mt-2 space-y-1 text-xs" dir="ltr">
          <li><code className="rounded bg-surface px-1.5 py-0.5">DATABASE_URL</code></li>
          <li><code className="rounded bg-surface px-1.5 py-0.5">AUTH_SECRET</code></li>
        </ul>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-secondary"
      >
        العودة إلى الصفحة الرئيسية
      </Link>
    </div>
  )
}
