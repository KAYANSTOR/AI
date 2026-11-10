import Link from 'next/link'

export const BRAND_NAME = 'KAYAN AI'
export const BRAND_TAGLINE = 'منصة الاستقبال الذكي للأعمال'

/** Decorative mark; the accessible name comes from the surrounding link. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ${className}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-[62%] w-[62%]">
        <path
          fill="currentColor"
          d="M9.5 8h13A3.5 3.5 0 0 1 26 11.5v8a3.5 3.5 0 0 1-3.5 3.5h-6.9l-4.2 3.3a.9.9 0 0 1-1.45-.7V23H9.5A3.5 3.5 0 0 1 6 19.5v-8A3.5 3.5 0 0 1 9.5 8Z"
        />
        <path stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" d="M12.5 13.5h7M12.5 17h4" />
      </svg>
    </span>
  )
}

export function BrandLockup({
  href = '/',
  className = '',
  subtitle,
  tone = 'light',
}: {
  href?: string
  className?: string
  subtitle?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${className}`}
    >
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className={`text-[15px] font-bold tracking-tight ${tone === 'dark' ? 'text-text' : 'text-text'}`}>
          {BRAND_NAME}
        </span>
        <span className={`hidden text-xs sm:block ${tone === 'dark' ? 'text-text/60' : 'text-text-muted'}`}>
          {subtitle ?? BRAND_TAGLINE}
        </span>
      </span>
    </Link>
  )
}
