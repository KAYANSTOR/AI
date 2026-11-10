'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export const inputClass =
  'block min-h-11 w-full rounded-xl border border-border-strong/70 bg-surface px-3.5 py-2.5 text-base text-text outline-none transition placeholder:text-text-muted/60 hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-accent/10 md:text-sm'

export function TextField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  minLength,
  required = true,
  action,
}: {
  id: string
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
  hint?: string
  minLength?: number
  required?: boolean
  action?: React.ReactNode
}) {
  const [revealed, setRevealed] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  const isPassword = type === 'password'

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-text">
          {label}
        </label>
        {action}
      </div>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={id}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required={required}
          dir={type === 'email' ? 'ltr' : undefined}
          aria-describedby={hintId}
          className={`${inputClass} ${isPassword ? 'pe-11' : ''} ${type === 'email' ? 'text-start' : ''}`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted transition-colors hover:text-text"
            aria-label={revealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs leading-6 text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-xl border border-error/30 bg-error/[0.06] px-4 py-3 text-sm font-medium text-error">
      {message}
    </div>
  )
}

export const submitClass =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60'
