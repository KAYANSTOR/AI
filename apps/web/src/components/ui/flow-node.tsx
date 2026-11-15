import type { ReactNode } from 'react'
import { Workflow } from 'lucide-react'
import { cx } from './cx'

export type FlowNodeProps = {
  type?: string
  title: string
  subtitle?: string
  icon?: ReactNode
  onClick?: () => void
  className?: string
}

export function FlowNode({
  type = 'المحفّز',
  title,
  subtitle,
  icon,
  onClick,
  className,
}: FlowNodeProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-surface p-3.5 transition-all text-start',
        onClick && 'cursor-pointer hover:border-border-strong active:scale-[0.99]',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
        <span className="text-[11px] font-semibold text-accent-text leading-tight">
          {type}
        </span>
        <h3 className="truncate text-[15px] font-semibold text-text leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="truncate text-[13px] leading-relaxed text-text-muted">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary shadow-xs">
        {icon || <Workflow className="h-5 w-5" aria-hidden="true" />}
      </div>
    </div>
  )
}
