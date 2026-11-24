'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './button'
import { cx } from './cx'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'

type OverlayProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

function useDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useHistoryDismiss(open, () => onOpenChange(false))
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
      returnFocus.current?.focus()
      returnFocus.current = null
    }
  }, [open])
  return ref
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useDialog(open, onOpenChange)
  return (
    <dialog
      ref={ref}
      onCancel={() => onOpenChange(false)}
      onClose={() => onOpenChange(false)}
      className={cx(
        'dialog-size m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-0 text-text shadow-overlay backdrop:bg-overlay/70 backdrop:backdrop-blur-sm',
        className
      )}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface p-5">
        <div>
          <h2 className="type-heading-3">{title}</h2>
          {description ? <p className="mt-1 type-body-small text-text-muted">{description}</p> : null}
        </div>
        <IconButton variant="ghost" size="sm" label="إغلاق" icon={<X className="h-icon-sm w-icon-sm" />} onClick={() => onOpenChange(false)} />
      </div>
      <div className="p-5">{children}</div>
      {footer ? <footer className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
    </dialog>
  )
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useDialog(open, onOpenChange)
  return (
    <dialog
      ref={ref}
      onCancel={() => onOpenChange(false)}
      onClose={() => onOpenChange(false)}
      className={cx(
        'drawer-size ms-auto me-0 h-dvh max-h-none translate-x-0 border-0 border-s border-border bg-surface p-0 text-text shadow-overlay backdrop:bg-overlay/70 backdrop:backdrop-blur-sm',
        className
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5 pt-safe">
          <div>
            <h2 className="type-heading-3">{title}</h2>
            {description ? <p className="mt-1 type-body-small text-text-muted">{description}</p> : null}
          </div>
          <IconButton variant="ghost" size="sm" label="إغلاق" icon={<X className="h-icon-sm w-icon-sm" />} onClick={() => onOpenChange(false)} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-3 border-t border-border p-5 pb-safe">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
