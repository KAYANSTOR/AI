'use client'

import { useMemo, useState } from 'react'
import {
  BedDouble, Boxes, Bot, BriefcaseBusiness, Building2, CakeSlice, Camera, Car, Check, ChevronLeft, Dumbbell,
  GraduationCap, House, Music, PartyPopper, Pill, Plane, Scale, Scissors, Search, Shirt, ShoppingBag, Smile,
  Stethoscope, Truck, Utensils, Wrench, type LucideIcon,
} from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { cx } from './cx'
import { VERTICALS, VERTICAL_GROUPS } from '@/lib/verticals/registry'
import { FEATURED_SECTOR_IDS, featuredSectors, searchSectors } from '@/lib/verticals/featured'

const ICONS: Record<string, LucideIcon> = {
  BedDouble, Boxes, Bot, BriefcaseBusiness, Building2, CakeSlice, Camera, Car, Dumbbell, GraduationCap, House,
  Music, PartyPopper, Pill, Plane, Scale, Scissors, Shirt, ShoppingBag, Smile, Stethoscope, Truck, Utensils, Wrench,
}

function SectorIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Building2
  return <Icon className={className} aria-hidden="true" />
}

const MORE_COUNT = VERTICALS.length - FEATURED_SECTOR_IDS.length

/** Sector picker: 5 featured cards, then a searchable sheet with all sectors grouped by engine. */
export function SectorPicker({
  value,
  onChange,
  name,
  id,
  label = 'نوع النشاط',
}: {
  value: string
  onChange: (id: string) => void
  name?: string
  id?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const featured = featuredSectors()
  const selected = VERTICALS.find((vertical) => vertical.id === value)
  const selectedIsFeatured = (FEATURED_SECTOR_IDS as readonly string[]).includes(value)
  const results = useMemo(() => (query.trim() ? searchSectors(query) : null), [query])

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  function row(vertical: (typeof VERTICALS)[number]) {
    const active = vertical.id === value
    return (
      <li key={vertical.id}>
        <button
          type="button"
          role="option"
          aria-selected={active}
          onClick={() => choose(vertical.id)}
          className={cx(
            'flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-start',
            active ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--brand-secondary)]' : 'border-border bg-surface text-text hover:bg-surface-muted'
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-secondary)] text-[var(--brand-primary)]">
            <SectorIcon name={vertical.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 font-semibold">{vertical.nameAr}</span>
          {active ? <Check className="h-5 w-5 shrink-0" aria-hidden="true" /> : null}
        </button>
      </li>
    )
  }

  return (
    <div id={id} role="group" aria-label={label} className="space-y-2.5">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {featured.map((vertical) => {
          const active = vertical.id === value
          return (
            <button
              key={vertical.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(vertical.id)}
              className={cx(
                'relative flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-start text-sm font-bold transition-colors',
                active
                  ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-[var(--brand-primary)]'
                  : 'border-border bg-surface text-[var(--brand-secondary)] hover:bg-[var(--brand-primary)]'
              )}
            >
              <SectorIcon name={vertical.icon} className="h-5 w-5" />
              <span className="leading-5">{vertical.nameAr}</span>
              {active ? <Check className="absolute end-2.5 top-2.5 h-4 w-4 text-[var(--brand-accent)]" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
      {selected && !selectedIsFeatured ? (
        <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--brand-secondary)] bg-[var(--brand-primary)] px-3 text-sm font-bold text-[var(--brand-secondary)]">
          <SectorIcon name={selected.icon} className="h-4 w-4" />
          <span className="flex-1">{selected.nameAr}</span>
          <Check className="h-4 w-4" aria-hidden="true" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-dashed border-[var(--brand-secondary)] px-3 text-sm font-bold text-[var(--brand-secondary)] hover:bg-[var(--brand-primary)]"
      >
        <span>المزيد من القطاعات ({MORE_COUNT} قطاعاً)</span>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <BottomSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }} title="اختر قطاع نشاطك" description={`${VERTICALS.length} قطاعاً متاحاً`}>
        <label className="relative mb-3 block">
          <span className="sr-only">ابحث عن قطاع</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث في جميع القطاعات…"
            className="min-h-11 w-full rounded-xl border border-border bg-surface-muted ps-9 pe-3 text-text focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30"
          />
        </label>
        {results ? (
          <ul role="listbox" aria-label="نتائج البحث" className="space-y-1.5">
            {results.map(row)}
            {results.length === 0 ? <li className="py-6 text-center text-sm text-text-muted">لا يوجد قطاع مطابق</li> : null}
          </ul>
        ) : (
          <div className="space-y-4">
            {VERTICAL_GROUPS.map((group) => (
              <section key={group.id}>
                <h3 className="mb-1.5 px-1 text-xs font-bold text-text-muted">{group.nameAr}</h3>
                <ul role="listbox" aria-label={group.nameAr} className="space-y-1.5">{group.verticals.map(row)}</ul>
              </section>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

/** Uncontrolled variant for plain `<form action>` flows (posts `name` via a hidden input). */
export function SectorPickerField({ name, defaultValue, label }: { name: string; defaultValue: string; label?: string }) {
  const [value, setValue] = useState(defaultValue)
  return <SectorPicker name={name} value={value} onChange={setValue} label={label} />
}
