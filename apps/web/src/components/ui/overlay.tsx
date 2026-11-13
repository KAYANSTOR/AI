'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './button'
import { cx } from './cx'

type OverlayProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
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
  const ref = useDialog(open)
  return (
    <dialog
      ref={ref}
      onCancel={() => onOpenChange(false)}
      onClose={() => onOpenChange(false)}
      className={cx(
        'dialog-size m-auto rounded-card border border-border bg-surface p-0 text-text shadow-overlay backdrop:bg-overlay/70 backdrop:backdrop-blur-sm',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="type-heading-3">{title}</h2>
          {description ? <p className="mt-1 type-body-small text-text-muted">{description}</p> : null}
        </div>
        <IconButton variant="ghost" size="sm" label="إغلاق" icon={<X className="h-icon-sm w-icon-sm" />} onClick={() => onOpenChange(false)} />
      </div>
      <div className="p-5">{children}</div>
      {footer ? <footer className="flex flex-wrap justify-end gap-3 border-t border-border p-5">{footer}</footer> : null}
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
  const ref = useDialog(open)
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
