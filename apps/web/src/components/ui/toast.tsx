'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { IconButton } from './button'
import { cx } from './cx'
import type { Tone } from './feedback'

type ToastItem = {
  id: number
  title: string
  description?: string
  tone?: Tone
}

type ToastContextValue = {
  toast: (item: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneClass: Record<Tone, string> = {
  success: 'border-success/30 bg-success-soft',
  warning: 'border-warning/30 bg-warning-soft',
  error: 'border-error/30 bg-error-soft',
  info: 'border-info/30 bg-info-soft',
  neutral: 'border-border bg-surface',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const toast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = Date.now()
    setItems((current) => [...current, { ...item, id }])
    window.setTimeout(() => setItems((current) => current.filter((entry) => entry.id !== id)), 5000)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-safe z-toast flex flex-col items-end gap-3 sm:start-auto sm:w-toast"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cx('pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 text-text shadow-raised', toneClass[item.tone || 'neutral'])}
          >
            <div className="min-w-0 flex-1">
              <p className="type-label">{item.title}</p>
              {item.description ? <p className="mt-1 type-body-small text-text-muted">{item.description}</p> : null}
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              label="إغلاق الإشعار"
              icon={<X className="h-icon-sm w-icon-sm" />}
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider.')
  return context
}
