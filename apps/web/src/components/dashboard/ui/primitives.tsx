import type { ReactNode } from 'react'
import { ArrowUpLeft, CheckCircle2, CircleAlert, Info } from 'lucide-react'

export function Paper({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.15rem] border border-border bg-surface ${className}`}>{children}</section>
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-secondary">{eyebrow}</p> : null}
        <h2 className="mt-1 text-base font-bold text-text sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function StateBadge({ state, label }: { state: 'success' | 'warning' | 'error' | 'info'; label: string }) {
  const styles = {
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    error: 'border-error/30 bg-error/10 text-error',
    info: 'border-secondary/30 bg-primary-light/30 text-secondary',
  }[state]
  const Icon = state === 'success' ? CheckCircle2 : state === 'error' ? CircleAlert : Info
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  )
}

export function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-xs font-bold text-secondary transition hover:text-primary">
      {children}
      <ArrowUpLeft size={13} aria-hidden="true" />
    </a>
  )
}
