import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-primary bg-primary text-primary-foreground hover:bg-primary-dark active:bg-primary-strong',
  secondary: 'border-border-strong bg-surface text-text hover:bg-surface-muted active:bg-border',
  accent: 'border-accent bg-accent text-accent-foreground hover:bg-accent-strong active:bg-accent-strong',
  outline: 'border-border-strong bg-transparent text-text hover:bg-surface-muted active:bg-border',
  ghost: 'border-transparent bg-transparent text-text-muted hover:bg-surface-muted hover:text-text active:bg-border',
  danger: 'border-error bg-error text-error-foreground hover:bg-error-strong active:bg-error-strong',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 rounded-lg px-3 text-xs',
  md: 'min-h-11 rounded-xl px-4 text-sm',
  lg: 'min-h-12 rounded-xl px-6 text-base',
  icon: 'h-11 w-11 rounded-xl p-0',
}

export const buttonBaseClass =
  'inline-flex shrink-0 items-center justify-center gap-2 border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-disabled'

export function buttonClass({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}) {
  return cx(buttonBaseClass, variantClasses[variant], sizeClasses[size], fullWidth && 'w-full', className)
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  loadingLabel?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    loadingLabel,
    leadingIcon,
    trailingIcon,
    className,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <Loader2 className="h-icon-sm w-icon-sm animate-spin" aria-hidden="true" /> : leadingIcon}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading && trailingIcon}
    </button>
  )
})

export type IconButtonProps = Omit<ButtonProps, 'children' | 'size'> & {
  label: string
  icon: ReactNode
  size?: 'sm' | 'md'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', className, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      size="icon"
      aria-label={label}
      title={label}
      className={cx(size === 'sm' && 'h-9 w-9 rounded-lg', className)}
      {...props}
    >
      {icon}
    </Button>
  )
})
