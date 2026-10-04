/**
 * The FrontDesk AI brand glyph — a reception bell whose dome carries an equalizer,
 * so the mark reads as “front desk” + “AI answering” in one shape.
 *
 * This is the single source of truth for the mark: the logo tile, the loading splash
 * and the static icon files (`src/app/icon.svg`, `public/icons/*.png`) all use the same
 * geometry, so a future change only has to happen once for the React usages.
 */
export function BrandGlyph({
  className = 'h-5 w-5',
  accent = 'var(--color-primary)',
  tone = 'currentColor',
}: {
  className?: string
  /** Color of the equalizer cut-outs; must match the surface the glyph sits on. */
  accent?: string
  /** Color of the bell itself. */
  tone?: string
}) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <g fill={tone}>
        <path d="M8.2 21.3V16.2a7.8 7.8 0 0 1 15.6 0v5.1Z" />
        <circle cx="16" cy="7.5" r="1.7" />
        <rect x="6.6" y="21.3" width="18.8" height="2.5" rx="1.25" />
      </g>
      <g fill={accent}>
        <rect x="12.2" y="16.4" width="2" height="2.9" rx="1" />
        <rect x="15" y="14.6" width="2" height="4.7" rx="1" />
        <rect x="17.8" y="15.8" width="2" height="3.5" rx="1" />
      </g>
    </svg>
  )
}
