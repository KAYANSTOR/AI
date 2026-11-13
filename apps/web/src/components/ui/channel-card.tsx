import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react'
import { cx } from './cx'

export type ChannelStatus = 'connected' | 'needsSetup' | 'disconnected'

export type ChannelCardProps = {
  name: string
  description: string
  status?: ChannelStatus
  icon?: ReactNode
  iconBg?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

const statusConfig: Record<
  ChannelStatus,
  {
    badgeLabel: string
    badgeClass: string
    icon: typeof CheckCircle2
    defaultAction: string
    buttonClass: string
  }
> = {
  connected: {
    badgeLabel: 'مربوطة',
    badgeClass: 'bg-success/10 text-success border-success/30',
    icon: CheckCircle2,
    defaultAction: 'إدارة القناة',
    buttonClass:
      'bg-surface border border-border-strong text-text hover:bg-surface-muted',
  },
  needsSetup: {
    badgeLabel: 'تحتاج إعداد',
    badgeClass: 'bg-warning/10 text-warning border-warning/30',
    icon: AlertTriangle,
    defaultAction: 'استكمال الربط',
    buttonClass:
      'bg-primary text-primary-foreground hover:bg-primary-dark',
  },
  disconnected: {
    badgeLabel: 'غير مربوطة',
    badgeClass: 'bg-surface-muted text-text-muted border-border',
    icon: CircleDashed,
    defaultAction: 'ربط القناة',
    buttonClass:
      'bg-primary text-primary-foreground hover:bg-primary-dark',
  },
}

export function ChannelCard({
  name,
  description,
  status = 'connected',
  icon,
  iconBg = 'bg-primary',
  actionLabel,
  onAction,
  className,
}: ChannelCardProps) {
  const config = statusConfig[status]
  const StatusIcon = config.icon

  return (
    <div
      className={cx(
        'flex flex-col justify-between gap-3.5 rounded-[20px] border border-border bg-surface p-4 text-start transition hover:border-border-strong/70',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Status badge */}
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            config.badgeClass
          )}
        >
          <StatusIcon className="h-3 w-3" aria-hidden="true" />
          {config.badgeLabel}
        </span>

        {/* Channel info */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
          <h3 className="truncate text-[16px] font-semibold text-text">{name}</h3>
          <p className="line-clamp-2 text-[13px] leading-relaxed text-text-muted">
            {description}
          </p>
        </div>

        {/* Icon tile */}
        <div
          className={cx(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm',
            iconBg
          )}
        >
          {icon}
        </div>
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={onAction}
        className={cx(
          'flex h-11 w-full items-center justify-center rounded-xl text-[14px] font-semibold transition active:scale-[0.99]',
          config.buttonClass
        )}
      >
        {actionLabel || config.defaultAction}
      </button>
    </div>
  )
}
