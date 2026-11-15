'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ChannelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Channels page error', error)
  }, [error])

  return (
    <div className="space-y-4 rounded-xl border border-error/40 bg-error/10 p-6">
      <h1 className="text-lg font-semibold text-text">تعذّر عرض صفحة القنوات</h1>
      <p className="text-sm text-text-muted">
        حدث خطأ أثناء تحميل القنوات. يمكنك إعادة المحاولة أو العودة للوحة التحكم.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          إعادة المحاولة
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text"
        >
          لوحة التحكم
        </Link>
      </div>
    </div>
  )
}
