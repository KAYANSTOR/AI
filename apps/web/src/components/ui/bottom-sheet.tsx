'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from './cx'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'

// Only the top-most sheet reacts to Esc when sheets are nested (e.g. a KayanSelect inside the payment sheet).
const openSheets: string[] = []

/**
 * Mobile-first bottom sheet (centered card from `sm`). z-50, closes on Back,
 * Esc and backdrop tap, locks page scroll, and keeps its footer actions
 * sticky above the safe-area inset.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const changeRef = useRef(onOpenChange)
  useEffect(() => { changeRef.current = onOpenChange })
  useHistoryDismiss(open, () => changeRef.current(false))

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    openSheets.push(titleId)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openSheets[openSheets.length - 1] === titleId) changeRef.current(false)
    }
    window.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not([data-sheet-close])')
      target?.focus({ preventScroll: true })
    }, 30)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
      const index = openSheets.lastIndexOf(titleId)
      if (index >= 0) openSheets.splice(index, 1)
      document.body.style.overflow = overflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [open, titleId])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--brand-secondary)_55%,transparent)] sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false) }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'kayan-sheet flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[26px] border border-border bg-surface text-text shadow-raised sm:max-w-lg sm:rounded-[26px]',
          className
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-extrabold text-secondary">{title}</h2>
            {description ? <div className="mt-1 text-xs leading-5 text-text-muted">{description}</div> : null}
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={() => onOpenChange(false)}
            aria-label="إغلاق"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-secondary hover:bg-primary-light"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
        {footer ? (
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface px-4 pt-3 pb-safe sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
