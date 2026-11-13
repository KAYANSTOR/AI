'use client'

import { useTransition } from 'react'
import { deleteReportAction, toggleReportActiveAction } from './actions'

export function ReportRowActions({
  reportId,
  isActive,
}: {
  reportId: string
  isActive: boolean
}) {
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text hover:bg-background disabled:opacity-50"
        onClick={() => start(async () => { await toggleReportActiveAction(reportId, !isActive) })}
      >
        {isActive ? 'إيقاف' : 'تفعيل'}
      </button>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-error/40 px-2 py-1 text-xs font-medium text-error hover:bg-error/10 disabled:opacity-50"
        onClick={() => {
          if (!confirm('حذف هذا التقرير؟')) return
          start(async () => { await deleteReportAction(reportId) })
        }}
      >
        حذف
      </button>
    </div>
  )
}
