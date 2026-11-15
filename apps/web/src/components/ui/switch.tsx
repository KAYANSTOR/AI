'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, disabled, className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus disabled:opacity-disabled',
        checked ? 'bg-primary' : 'bg-border-strong',
        className
      )}
      {...props}
    >
      <span
        className={cx(
          'pointer-events-none block h-5 w-5 rounded-full bg-surface shadow-card transition-transform',
          checked ? 'translate-x-switch-rtl rtl:-translate-x-switch-rtl' : 'translate-x-0'
        )}
      />
    </button>
  )
})
