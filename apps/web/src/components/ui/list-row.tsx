import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Switch } from './switch'
import { cx } from './cx'

export type ListRowProps = {
  title: string
  subtitle?: string
  icon?: ReactNode
  trailing?: 'chevron' | 'meta' | 'badge' | 'toggle' | 'custom'
  trailingContent?: ReactNode
  meta?: string
  badgeLabel?: string
  badgeTone?: 'success' | 'warning' | 'neutral'
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  onClick?: () => void
  className?: string
}

export function ListRow({
  title,
  subtitle,
  icon,
  trailing = 'chevron',
  trailingContent,
  meta,
  badgeLabel,
  badgeTone = 'success',
  checked,
  onCheckedChange,
  onClick,
  className,
}: ListRowProps) {
  const badgeClasses = {
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    neutral: 'bg-surface-muted text-text-muted border-border',
  }[badgeTone]

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-surface p-3.5 transition-all text-start',
        onClick && 'cursor-pointer hover:border-border-strong/80 active:scale-[0.99]',
        className
      )}
    >
      {/* Leading icon & text */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            {icon}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[14px] font-semibold text-text">{title}</p>
          {subtitle && (
            <p className="truncate text-[12px] text-text-muted">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Trailing item */}
      <div className="flex shrink-0 items-center gap-2">
        {trailing === 'chevron' && (
          <span className="text-text-muted">
            <ChevronLeft className="h-5 w-5 rtl:block ltr:hidden" aria-hidden="true" />
            <ChevronRight className="h-5 w-5 rtl:hidden ltr:block" aria-hidden="true" />
          </span>
        )}

        {trailing === 'meta' && (
          <span className="text-[12px] font-medium text-text-muted">{meta}</span>
        )}

        {trailing === 'badge' && badgeLabel && (
          <span
            className={cx(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
              badgeClasses
            )}
          >
            {badgeLabel}
          </span>
        )}

        {trailing === 'toggle' && (
          <Switch
            checked={!!checked}
            onCheckedChange={onCheckedChange || (() => {})}
            aria-label={title}
          />
        )}

        {trailing === 'custom' && trailingContent}
      </div>
    </div>
  )
}
