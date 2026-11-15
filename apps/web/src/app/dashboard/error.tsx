'use client'

import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard runtime error:', error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-[420px] flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 text-error shadow-sm">
        <AlertCircle className="h-8 w-8" aria-hidden="true" />
      </div>

      <h2 className="text-xl font-bold text-text">تعذّر تحميل البيانات</h2>

      <p className="text-sm leading-relaxed text-text-muted">
        حدث خطأ غير متوقع أثناء معالجة الطلب. يرجى التحقق من اتصالك وإعادة المحاولة.
      </p>

      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-95"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        <span>إعادة المحاولة</span>
      </button>
    </div>
  )
}
