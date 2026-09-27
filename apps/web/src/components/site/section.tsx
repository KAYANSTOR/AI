import type { ReactNode } from 'react'

type Tone = 'background' | 'surface' | 'dark'

const TONE_CLASS: Record<Tone, string> = {
  background: 'bg-background text-text',
  surface: 'bg-surface text-text',
  dark: 'bg-dark text-white',
}

/** Page section with consistent vertical rhythm and a stable anchor target. */
export function Section({
  id,
  tone = 'background',
  className = '',
  labelledBy,
  children,
}: {
  id?: string
  tone?: Tone
  className?: string
  labelledBy?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`scroll-mt-24 ${TONE_CLASS[tone]} ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        {children}
      </div>
    </section>
  )
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  tone = 'light',
  align = 'center',
}: {
  id: string
  eyebrow?: string
  title: string
  description?: string
  tone?: 'light' | 'dark'
  align?: 'center' | 'start'
}) {
  const isDark = tone === 'dark'

  return (
    <header className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? (
        <p
          className={`text-xs font-semibold tracking-[0.16em] ${
            isDark ? 'text-primary-light' : 'text-primary-dark'
          }`}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={`mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl ${
          isDark ? 'text-white' : 'text-text'
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-4 text-sm leading-8 sm:text-base ${
            isDark ? 'text-white/75' : 'text-text-muted'
          }`}
        >
          {description}
        </p>
      ) : null}
    </header>
  )
}

/** Neutral chip used for labels, availability badges and capability tags. */
export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'soon'
  className?: string
}) {
  const tones = {
    neutral: 'border-border bg-background text-text-muted',
    brand: 'border-primary-light bg-primary-light/30 text-primary-dark',
    soon: 'border-border bg-surface text-text-muted',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
