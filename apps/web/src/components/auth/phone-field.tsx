'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cx } from '@/components/ui/cx'
import { ARAB_COUNTRIES, DEFAULT_COUNTRY, type ArabCountry } from '@/lib/phone/arab-countries'
import { foldArabic } from '@/lib/text/fold-arabic'
import { inputClass } from './field'

/** Arab country dial-code picker + national number input. Yemen (+967) is the default. */
export function PhoneField({
  id,
  label,
  dial,
  onDialChange,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  dial: string
  onDialChange: (dial: string) => void
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const country: ArabCountry = ARAB_COUNTRIES.find((item) => item.dial === dial) ?? DEFAULT_COUNTRY
  const results = useMemo(() => {
    const needle = foldArabic(query.replace(/^\+/, ''))
    if (!needle) return ARAB_COUNTRIES
    return ARAB_COUNTRIES.filter((item) => foldArabic(`${item.nameAr} ${item.iso}`).includes(needle) || item.dial.startsWith(needle))
  }, [query])
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">{label}</label>
      <div dir="ltr" className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`رمز الدولة: ${country.nameAr} +${country.dial}`}
          className="flex h-[52px] shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-base font-semibold text-[var(--brand-secondary)] hover:border-border-strong"
        >
          <span aria-hidden="true">{country.flag}</span>
          <span>+{country.dial}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="777 123 456"
          aria-describedby={hintId}
          className={cx(inputClass, 'min-w-0 flex-1 text-left')}
        />
      </div>
      {hint ? <p id={hintId} className="mt-1.5 text-xs leading-6 text-text-muted">{hint}</p> : null}
      <BottomSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }} title="اختر الدولة">
        <label className="relative mb-3 block">
          <span className="sr-only">ابحث عن دولة</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="اسم الدولة أو الرمز"
            className="min-h-11 w-full rounded-xl border border-border bg-surface-muted ps-9 pe-3 text-text focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30"
          />
        </label>
        <ul role="listbox" aria-label="الدول العربية" className="space-y-1.5">
          {results.map((item) => {
            const active = item.dial === country.dial
            return (
              <li key={item.iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onDialChange(item.dial); setOpen(false); setQuery('') }}
                  className={cx(
                    'flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 text-start',
                    active ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--brand-secondary)]' : 'border-border bg-surface text-text hover:bg-surface-muted'
                  )}
                >
                  <span className="text-xl" aria-hidden="true">{item.flag}</span>
                  <span className="flex-1 font-semibold">{item.nameAr}</span>
                  <span dir="ltr" className="text-sm font-bold text-text-muted">+{item.dial}</span>
                  {active ? <Check className="h-5 w-5" aria-hidden="true" /> : null}
                </button>
              </li>
            )
          })}
          {results.length === 0 ? <li className="py-6 text-center text-sm text-text-muted">لا توجد دولة مطابقة</li> : null}
        </ul>
      </BottomSheet>
    </div>
  )
}
