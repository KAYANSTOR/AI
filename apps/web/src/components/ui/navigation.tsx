import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from './cx'

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface-muted p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  active = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cx(
        'min-h-9 rounded-lg px-3 type-label transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus',
        active ? 'bg-surface text-text shadow-card' : 'text-text-muted hover:text-text',
        className
      )}
      {...props}
    />
  )
}

export function Dropdown({
  label,
  children,
  align = 'end',
  className,
}: {
  label: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  return (
    <details className={cx('group relative', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-surface px-3 type-label text-text transition hover:border-border-strong [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="h-icon-sm w-icon-sm text-text-muted transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div
        role="menu"
        className={cx(
          'absolute top-full z-dropdown mt-2 min-w-52 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-raised',
          align === 'end' ? 'end-0' : 'start-0'
        )}
      >
        {children}
      </div>
    </details>
  )
}

export function DropdownItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx('flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-start type-body-small text-text transition hover:bg-surface-muted', className)}
      {...props}
    />
  )
}

export function Tooltip({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full start-1/2 z-tooltip mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-dark px-2.5 py-1.5 type-caption text-dark-foreground shadow-raised group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {label}
      </span>
    </span>
  )
}

export function Pagination({
  previousHref,
  nextHref,
  page,
  totalPages,
  className,
}: {
  previousHref?: string
  nextHref?: string
  page: number
  totalPages: number
  className?: string
}) {
  const linkClass =
    'inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-surface px-3 type-label text-text transition hover:border-border-strong aria-disabled:pointer-events-none aria-disabled:opacity-disabled'
  return (
    <nav aria-label="ترقيم الصفحات" className={cx('flex items-center justify-between gap-4', className)}>
      <Link href={previousHref || '#'} aria-disabled={!previousHref} className={linkClass}>
        <ChevronRight className="h-icon-sm w-icon-sm rtl:block ltr:hidden" aria-hidden="true" />
        <ChevronLeft className="hidden h-icon-sm w-icon-sm ltr:block" aria-hidden="true" />
        السابق
      </Link>
      <span className="type-caption text-text-muted">
        {page} / {totalPages}
      </span>
      <Link href={nextHref || '#'} aria-disabled={!nextHref} className={linkClass}>
        التالي
        <ChevronLeft className="h-icon-sm w-icon-sm rtl:block ltr:hidden" aria-hidden="true" />
        <ChevronRight className="hidden h-icon-sm w-icon-sm ltr:block" aria-hidden="true" />
      </Link>
    </nav>
  )
}
