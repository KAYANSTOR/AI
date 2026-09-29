'use client'

import { useState } from 'react'
import { changeOrderStatusAction } from '../actions'
import { Loader2, Check, Play, Ban } from 'lucide-react'

export function OrderActions({ orderId, currentStatus }: { orderId: string, currentStatus: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStatusChange = async (newStatus: 'confirmation' | 'processing' | 'completed' | 'cancelled') => {
    setLoading(newStatus)
    setError(null)
    const result = await changeOrderStatusAction(orderId, newStatus)
    if (!result.ok) {
      setError(result.error || 'حدث خطأ.')
    }
    setLoading(null)
  }

  if (['completed', 'cancelled'].includes(currentStatus)) {
    return null
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-error/15 p-3 text-xs text-error">{error}</div>}
      
      <div className="flex flex-wrap gap-2">
        {currentStatus === 'draft' && (
          <>
            <button
              onClick={() => handleStatusChange('confirmation')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading === 'confirmation' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              طلب تأكيد
            </button>
            <button
              onClick={() => handleStatusChange('processing')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {loading === 'processing' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              تأكيد وبدء المعالجة
            </button>
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted hover:text-error disabled:opacity-50"
            >
              {loading === 'cancelled' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              إلغاء
            </button>
          </>
        )}

        {currentStatus === 'confirmation' && (
          <>
            <button
              onClick={() => handleStatusChange('processing')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading === 'processing' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              تأكيد وبدء المعالجة
            </button>
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted hover:text-error disabled:opacity-50"
            >
              {loading === 'cancelled' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              إلغاء
            </button>
          </>
        )}

        {currentStatus === 'processing' && (
          <>
            <button
              onClick={() => handleStatusChange('completed')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/80 disabled:opacity-50"
            >
              {loading === 'completed' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              اكتمال الطلب
            </button>
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted hover:text-error disabled:opacity-50"
            >
              {loading === 'cancelled' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              إلغاء
            </button>
          </>
        )}
      </div>
    </div>
  )
}
