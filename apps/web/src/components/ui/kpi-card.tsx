import type { ReactNode } from 'react'
import { cx } from './cx'

export type KpiCardTone = 'default' | 'dark' | 'gold'

export type KpiCardProps = {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
  tone?: KpiCardTone
  className?: string
  onClick?: () => void
}

const toneStyles: Record<
  KpiCardTone,
  {
    container: string
    iconTile: string
    label: string
    value: string
    hint: string
  }
> = {
  default: {
    container: 'bg-surface border border-border text-text',
    iconTile: 'bg-primary-light text-primary',
    label: 'text-text-muted',
    value: 'text-text',
    hint: 'text-text-muted',
  },
  dark: {
    container: 'bg-dark text-text border border-transparent shadow-sm',
    iconTile: 'bg-text/10 text-accent',
    label: 'text-text/75',
    value: 'text-text',
    hint: 'text-text/70',
  },
  gold: {
    container: 'bg-accent-light border border-border-strong text-text',
    iconTile: 'bg-accent text-accent-foreground',
    label: 'text-accent-text',
    value: 'text-text',
    hint: 'text-accent-text',
  },
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
  onClick,
}: KpiCardProps) {
  const styles = toneStyles[tone]

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'flex min-h-[104px] flex-col gap-2 rounded-2xl p-4 transition-all duration-200',
        styles.container,
        onClick && 'cursor-pointer hover:shadow-md active:scale-[0.99]',
        className
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className={cx('text-[12px] font-medium leading-tight', styles.label)}>
          {label}
        </span>
        {icon && (
          <div
            className={cx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              styles.iconTile
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <p className={cx('text-[24px] font-bold leading-tight tracking-tight', styles.value)}>
        {value}
      </p>

      {hint && (
        <p className={cx('text-[12px] font-medium leading-tight', styles.hint)}>
          {hint}
        </p>
      )}
    </div>
  )
}
