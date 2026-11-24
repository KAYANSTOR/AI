'use client'

import {
  Children,
  Fragment,
  isValidElement,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { cx } from './cx'
import { foldArabic } from '@/lib/text/fold-arabic'

export type KayanSelectOption = {
  value: string
  label: string
  description?: string
  group?: string
  disabled?: boolean
  icon?: ReactNode
}

type OptionLikeProps = { value?: unknown; children?: ReactNode; disabled?: boolean; label?: string }

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children)
  return ''
}

/** Reads native `<option>` / `<optgroup>` children so call sites can migrate without rewriting their option lists. */
export function optionsFromChildren(children: ReactNode, group?: string): KayanSelectOption[] {
  const result: KayanSelectOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const element = child as ReactElement<OptionLikeProps>
    if (element.type === Fragment) {
      result.push(...optionsFromChildren(element.props.children, group))
    } else if (element.type === 'optgroup') {
      result.push(...optionsFromChildren(element.props.children, element.props.label))
    } else if (element.type === 'option') {
      const label = nodeText(element.props.children)
      const value = element.props.value === undefined ? label : String(element.props.value)
      result.push({ value, label, group, disabled: Boolean(element.props.disabled) })
    }
  })
  return result
}

export function filterOptions(options: KayanSelectOption[], query: string): KayanSelectOption[] {
  const needle = foldArabic(query)
  if (!needle) return options
  return options.filter((option) => foldArabic(`${option.label} ${option.description ?? ''} ${option.group ?? ''} ${option.value}`).includes(needle))
}

export type KayanSelectProps = {
  options?: KayanSelectOption[]
  children?: ReactNode
  value?: string
  defaultValue?: string
  /** Receives a select-like event so `(event) => set(event.target.value)` handlers keep working. */
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  onValueChange?: (value: string) => void
  name?: string
  id?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  className?: string
  title?: string
  searchable?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

export function KayanSelect({
  options: optionsProp,
  children,
  value,
  defaultValue,
  onChange,
  onValueChange,
  name,
  id,
  disabled,
  required,
  placeholder = 'اختر…',
  className,
  title,
  searchable,
  ...aria
}: KayanSelectProps) {
  const options = useMemo(() => optionsProp ?? optionsFromChildren(children), [optionsProp, children])
  const [inner, setInner] = useState(defaultValue ?? options.find((option) => !option.disabled)?.value ?? '')
  const current = value ?? inner
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === current)
  const showSearch = searchable ?? options.length > 7
  const visible = filterOptions(options, query)
  const sheetTitle = title ?? aria['aria-label'] ?? placeholder

  function choose(next: string) {
    if (value === undefined) setInner(next)
    setOpen(false)
    setQuery('')
    if (next === current) return
    onValueChange?.(next)
    if (onChange) {
      const target = { value: next, name: name ?? '' }
      onChange({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>)
    }
  }

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        data-kayan-select
        className={cx(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-start text-text disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !selected?.label && 'text-text-muted')}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
      </button>
      {/* Visually hidden text input (not type=hidden) so native `required` validation and FormData both work. */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        name={name}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => undefined}
        aria-invalid={aria['aria-invalid']}
        onFocus={() => setOpen(true)}
      />
      <BottomSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }} title={sheetTitle}>
        {showSearch ? (
          <label className="relative mb-3 block">
            <span className="sr-only">بحث</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث…"
              className="min-h-11 w-full rounded-xl border border-border bg-surface-muted ps-9 pe-3 text-text focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30"
            />
          </label>
        ) : null}
        <ul role="listbox" aria-label={sheetTitle} className="space-y-1.5">
          {visible.map((option, index) => {
            const header = option.group && option.group !== visible[index - 1]?.group ? option.group : null
            const active = option.value === current
            return (
              <li key={`${option.group ?? ''}:${option.value}`}>
                {header ? <p className="px-1 pb-1 pt-2 text-xs font-bold text-text-muted">{header}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => choose(option.value)}
                  className={cx(
                    'flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-start transition-colors disabled:opacity-50',
                    active
                      ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--brand-secondary)]'
                      : 'border-border bg-surface text-text hover:bg-surface-muted'
                  )}
                >
                  {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{option.label || placeholder}</span>
                    {option.description ? <span className="mt-0.5 block text-xs leading-5 text-text-muted">{option.description}</span> : null}
                  </span>
                  {active ? <Check className="h-5 w-5 shrink-0 text-[var(--brand-secondary)]" aria-hidden="true" /> : null}
                </button>
              </li>
            )
          })}
          {visible.length === 0 ? <li className="py-6 text-center text-sm text-text-muted">لا توجد نتائج مطابقة</li> : null}
        </ul>
      </BottomSheet>
    </>
  )
}
