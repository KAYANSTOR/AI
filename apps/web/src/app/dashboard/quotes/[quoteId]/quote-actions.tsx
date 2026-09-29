'use client'

import { useState } from 'react'
import { changeQuoteStatusAction } from '../actions'
import { Loader2, Check, X, Send, Ban } from 'lucide-react'

export function QuoteActions({ quoteId, currentStatus }: { quoteId: string, currentStatus: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStatusChange = async (newStatus: 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled') => {
    setLoading(newStatus)
    setError(null)
    const result = await changeQuoteStatusAction(quoteId, newStatus)
    if (!result.ok) {
      setError(result.error || 'حدث خطأ.')
    }
    setLoading(null)
  }

  if (['accepted', 'rejected', 'expired', 'cancelled'].includes(currentStatus)) {
    return null
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-error/15 p-3 text-xs text-error">{error}</div>}
      
      <div className="flex flex-wrap gap-2">
        {currentStatus === 'draft' && (
          <>
            <button
              onClick={() => handleStatusChange('sent')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading === 'sent' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              إرسال للعميل
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

        {currentStatus === 'sent' && (
          <>
            <button
              onClick={() => handleStatusChange('accepted')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/80 disabled:opacity-50"
            >
              {loading === 'accepted' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              تأكيد القبول
            </button>
            <button
              onClick={() => handleStatusChange('rejected')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/80 disabled:opacity-50"
            >
              {loading === 'rejected' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              مرفوض
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
