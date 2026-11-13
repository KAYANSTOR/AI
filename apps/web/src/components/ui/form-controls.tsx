import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from './cx'

export const controlClass =
  'min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-base text-text outline-none transition placeholder:text-text-muted/60 hover:border-primary/60 focus:border-accent focus:ring-4 focus:ring-focus disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-disabled md:text-sm'

export const FieldLabel = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function FieldLabel({ className, ...props }, ref) {
    return <label ref={ref} className={cx('type-label block text-text', className)} {...props} />
  }
)

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  action,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string | null
  required?: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const descriptionId = hint || error ? `${htmlFor}-description` : undefined
  return (
    <div className={cx('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={htmlFor}>
          {label}
          {required ? <span className="ms-1 text-error" aria-hidden="true">*</span> : null}
        </FieldLabel>
        {action}
      </div>
      {children}
      {hint || error ? (
        <p
          id={descriptionId}
          className={cx('type-caption', error ? 'text-error' : 'text-text-muted')}
          role={error ? 'alert' : undefined}
        >
          {error || hint}
        </p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, 'aria-invalid': invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid}
        className={cx(controlClass, invalid && 'border-error focus:border-error focus:ring-error/15', className)}
        {...props}
      />
    )
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx(controlClass, 'min-h-28 resize-y', className)} {...props} />
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <span className="relative block">
        <select
          ref={ref}
          className={cx(controlClass, 'appearance-none pe-10', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 h-icon-sm w-icon-sm -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </span>
    )
  }
)

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          className={cx(
            'peer h-5 w-5 appearance-none rounded-md border border-border-strong bg-surface transition checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus disabled:opacity-disabled',
            className
          )}
          {...props}
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto hidden h-icon-xs w-icon-xs text-primary-foreground peer-checked:block"
          aria-hidden="true"
        />
      </span>
    )
  }
)

export const Radio = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Radio({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="radio"
        className={cx(
          'radio-control h-5 w-5 appearance-none rounded-full border border-border-strong bg-surface transition checked:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus disabled:opacity-disabled',
          className
        )}
        {...props}
      />
    )
  }
)
