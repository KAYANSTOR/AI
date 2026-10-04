import Link from 'next/link'
import { BrandGlyph } from './brand-glyph'

export const BRAND_NAME = 'FrontDesk AI'
export const BRAND_TAGLINE = 'موظّف استقبال بالذكاء الاصطناعي'

export { BrandGlyph }

/**
 * Brand mark: brand-colored tile + the reception-bell glyph.
 * Decorative — the accessible name comes from the surrounding link/label.
 */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground ${className}`}
    >
      <BrandGlyph className="h-[92%] w-[92%]" />
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
