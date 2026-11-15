import type { HTMLAttributes, ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { cx } from './cx'

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const toneClasses: Record<Tone, string> = {
  success: 'border-success/30 bg-success-soft text-success-strong',
  warning: 'border-warning/30 bg-warning-soft text-warning-strong',
  error: 'border-error/30 bg-error-soft text-error-strong',
  info: 'border-info/30 bg-info-soft text-info-strong',
  neutral: 'border-border bg-surface-muted text-text',
}

const toneIcons: Record<Exclude<Tone, 'neutral'>, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: CircleAlert,
  info: Info,
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 type-caption font-semibold', toneClasses[tone], className)}
      {...props}
    />
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Exclude<Tone, 'neutral'>; title?: ReactNode }) {
  const Icon = toneIcons[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-xl border p-4', toneClasses[tone], className)}
      {...props}
    >
      <Icon className="mt-0.5 h-icon-sm w-icon-sm shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <div className="type-label">{title}</div> : null}
        <div className={cx('type-body-small', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  )
}

export function LoadingState({
  label = 'جارٍ التحميل…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div role="status" className={cx('flex min-h-40 flex-col items-center justify-center gap-3 text-text-muted', className)}>
      <Loader2 className="h-icon-lg w-icon-lg animate-spin text-secondary" aria-hidden="true" />
      <p className="type-body-small">{label}</p>
    </div>
  )
}

export function StatePanel({
  icon: Icon = Info,
  title,
  description,
  action,
  actionProps,
  tone = 'neutral',
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  actionProps?: ButtonProps
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cx('flex min-h-56 flex-col items-center justify-center rounded-card border p-8 text-center', toneClasses[tone], className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface shadow-card">
        <Icon className="h-icon-md w-icon-md" aria-hidden="true" />
      </span>
      <div className="mt-4 type-heading-3">{title}</div>
      {description ? <div className="mt-2 max-w-prose type-body-small opacity-80">{description}</div> : null}
      {action ? <Button className="mt-5" {...actionProps}>{action}</Button> : null}
    </div>
  )
}

export function EmptyState(props: Omit<Parameters<typeof StatePanel>[0], 'tone'>) {
  return <StatePanel tone="neutral" {...props} />
}

export function ErrorState(props: Omit<Parameters<typeof StatePanel>[0], 'tone'>) {
  return <StatePanel tone="error" {...props} />
}
