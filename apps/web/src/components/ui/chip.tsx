import type { ReactNode } from 'react'
import { cx } from './cx'

export type ChipProps = {
  label: string
  selected?: boolean
  onClick?: () => void
  count?: number | string
  icon?: ReactNode
  className?: string
}

export function Chip({
  label,
  selected = false,
  onClick,
  count,
  icon,
  className,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition active:scale-95',
        selected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'border border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
        className
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cx(
            'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
            selected
              ? 'bg-primary-dark text-primary-foreground'
              : 'bg-surface-muted text-text-muted'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
