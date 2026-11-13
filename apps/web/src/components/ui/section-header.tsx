import type { ReactNode } from 'react'
import Link from 'next/link'
import { cx } from './cx'

export type SectionHeaderProps = {
  title: string
  action?: string | ReactNode
  actionHref?: string
  onAction?: () => void
  className?: string
}

export function SectionHeader({
  title,
  action,
  actionHref,
  onAction,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-1', className)}>
      <h2 className="text-[17px] font-semibold text-text">{title}</h2>

      {action && (
        <div>
          {actionHref ? (
            <Link
              href={actionHref}
              className="text-[13px] font-semibold text-accent-text transition hover:underline"
            >
              {action}
            </Link>
          ) : typeof action === 'string' && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-[13px] font-semibold text-accent-text transition hover:underline"
            >
              {action}
            </button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  )
}
