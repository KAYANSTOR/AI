import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type CardTone = 'default' | 'muted' | 'brand' | 'accent'

const toneClasses: Record<CardTone, string> = {
  default: 'border-border bg-surface text-text',
  muted: 'border-border bg-surface-muted text-text',
  brand: 'border-primary/30 bg-primary-light text-text',
  accent: 'border-accent/30 bg-accent-light text-text',
}

export function Card({
  tone = 'default',
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: CardTone; interactive?: boolean }) {
  return (
    <section
      className={cx(
        'rounded-card border shadow-card',
        toneClasses[tone],
        interactive && 'transition hover:-translate-y-px hover:border-border-strong hover:shadow-raised',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cx('flex items-start justify-between gap-4 border-b border-border p-5', className)}>
      <div className="min-w-0">
        <div className="type-heading-3 text-text">{title}</div>
        {description ? <div className="mt-1 type-body-small text-text-muted">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <footer className={cx('flex items-center gap-3 border-t border-border p-5', className)} {...props} />
}
