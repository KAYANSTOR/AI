'use client'

import { AlertCircle } from 'lucide-react'

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-error/30 bg-surface p-6 text-center">
      <AlertCircle className="h-8 w-8 text-error" aria-hidden="true" />
      <h2 className="text-lg font-bold text-text">تعذّر تحميل الصفحة</h2>
      <p className="text-sm text-text-muted">تحقق من اتصالك ثم أعد المحاولة.</p>
      <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-primary-dark px-5 text-sm font-semibold text-primary-dark-foreground">إعادة المحاولة</button>
    </section>
  )
}
