import Link from 'next/link'

export const BRAND_NAME = 'KAYAN AI'
export const BRAND_TAGLINE = 'منصة الاستقبال الذكي للأعمال'

/** Shared KAYAN AI monogram: a geometric K with an AI sparkle. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-dark ${className}`}
    >
      <svg viewBox="0 0 512 512" fill="none" className="h-[82%] w-[82%]">
        <g
          stroke="currentColor"
          strokeWidth="78"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M151 385V127" />
          <path d="M178 256L321 122" />
          <path d="M178 256L348 397" />
        </g>
        <path
          fill="var(--k-accent)"
          d="M384 66C396 105 407 116 446 128C407 140 396 151 384 190C372 151 361 140 322 128C361 116 372 105 384 66Z"
        />
      </svg>
    </span>
  )
}

export function BrandLockup({
  href = '/',
  className = '',
  markClassName,
  subtitle,
  tone = 'light',
}: {
  href?: string
  className?: string
  markClassName?: string
  subtitle?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${className}`}
    >
      <BrandMark className={markClassName} />
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
