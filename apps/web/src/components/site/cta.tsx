import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Brand CTA buttons.
 * Primary uses Primary Dark as the resting color so white label text keeps
 * accessible contrast; Primary itself is the hover/active step (PLAN brand rules).
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 sm:text-base'

const PRIMARY = `${BASE} bg-primary-dark text-surface shadow-sm hover:bg-primary`
const SECONDARY = `${BASE} border border-border bg-surface text-text hover:border-primary-dark hover:text-primary-dark`

export function PrimaryCta({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={`${PRIMARY} ${className}`}>
      {children}
    </Link>
  )
}

export function SecondaryCta({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={`${SECONDARY} ${className}`}>
      {children}
    </Link>
  )
}
