import Link from 'next/link'

export const BRAND_NAME = 'FrontDesk AI'
export const BRAND_TAGLINE = 'موظّف استقبال بالذكاء الاصطناعي'

/**
 * Brand mark: brand-colored surface + speech bubble glyph.
 * Decorative — the accessible name comes from the surrounding link/label.
 */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary text-surface ${className}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-[62%] w-[62%]">
        <path
          fill="currentColor"
          d="M9.5 8h13A3.5 3.5 0 0 1 26 11.5v8a3.5 3.5 0 0 1-3.5 3.5h-6.9l-4.2 3.3a.9.9 0 0 1-1.45-.7V23H9.5A3.5 3.5 0 0 1 6 19.5v-8A3.5 3.5 0 0 1 9.5 8Z"
        />
        <path
          stroke="var(--color-primary)"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M12.5 13.5h7M12.5 17h4"
        />
      </svg>
    </span>
  )
}

export function BrandLockup({
  href = '/',
  className = '',
  subtitle,
}: {
  href?: string
  className?: string
  subtitle?: string
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 ${className}`}
    >
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className="text-base font-bold tracking-tight">{BRAND_NAME}</span>
        {/* الشعار الفرعي مخفي على أصغر الشاشات حتى لا يتسبب في تجاوز أفقي */}
        <span className="hidden text-xs text-text-muted sm:block">
          {subtitle ?? BRAND_TAGLINE}
        </span>
      </span>
    </Link>
  )
}
