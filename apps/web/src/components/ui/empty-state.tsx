import type { ReactNode, ComponentType } from 'react'
import { MessageSquare } from 'lucide-react'
import { cx } from './cx'

export type MobileEmptyStateProps = {
  title: string
  description?: string
  icon?: ComponentType<{ className?: string }> | ReactNode
  action?: ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

function renderEmptyStateIcon(Icon: ComponentType<{ className?: string }> | ReactNode) {
  if (typeof Icon === 'function') {
    const IconComp = Icon
    return <IconComp className="h-8 w-8" aria-hidden="true" />
  }
  return Icon as ReactNode
}

export function MobileEmptyState({
  title,
  description,
  icon = MessageSquare,
  action,
  actionLabel,
  onAction,
  className,
}: MobileEmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-12 px-4 text-center',
        className
      )}
    >
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary-light text-primary shadow-sm">
        {renderEmptyStateIcon(icon)}
      </div>

      <h3 className="text-[17px] font-semibold text-text">{title}</h3>

      {description && (
        <p className="max-w-sm text-[14px] leading-relaxed text-text-muted">
          {description}
        </p>
      )}

      {action ||
        (actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-95"
          >
            {actionLabel}
          </button>
        ))}
    </div>
  )
}
