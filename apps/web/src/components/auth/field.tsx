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
}) {
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-text">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        aria-describedby={hintId}
        className="mt-2 block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text shadow-sm outline-none transition-colors placeholder:text-text-muted/70 focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs leading-6 text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
