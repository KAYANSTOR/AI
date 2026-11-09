import Link from 'next/link'
import type { ReactNode } from 'react'

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20'

const PRIMARY = `${BASE} bg-primary text-primary-foreground hover:bg-primary-dark`
const SECONDARY = `${BASE} border border-border-strong/70 bg-surface text-text hover:border-text/40`
const SECONDARY_ON_DARK = `${BASE} border border-surface/25 text-surface hover:border-surface/60`

type CtaProps = { href: string; children: ReactNode; className?: string }

export function PrimaryCta({ href, children, className = '' }: CtaProps) {
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
  onDark = false,
}: CtaProps & { onDark?: boolean }) {
  return (
    <Link href={href} className={`${onDark ? SECONDARY_ON_DARK : SECONDARY} ${className}`}>
      {children}
    </Link>
  )
}
