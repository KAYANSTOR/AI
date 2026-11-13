import type { ReactNode } from 'react'
import { Phone, Smartphone, Globe } from 'lucide-react'
import { cx } from './cx'

export type ConversationChannel = 'whatsapp' | 'instagram' | 'sms' | 'phone' | 'web'

export type ConversationItemProps = {
  name: string
  preview: string
  time: string
  unread?: boolean
  unreadCount?: number
  channel?: ConversationChannel
  avatarText?: string
  avatarImage?: string
  selected?: boolean
  onClick?: () => void
  trailing?: ReactNode
  className?: string
}

function ChannelDot({ channel = 'whatsapp' }: { channel?: ConversationChannel }) {
  const icon = {
    whatsapp: <span className="text-[10px] font-bold text-white leading-none">W</span>,
    instagram: (
      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
    sms: <Smartphone className="h-2.5 w-2.5 text-white" />,
    phone: <Phone className="h-2.5 w-2.5 text-white" />,
    web: <Globe className="h-2.5 w-2.5 text-white" />,
  }[channel]

  const bg = {
    whatsapp: 'bg-[#2fa866]',
    instagram: 'bg-[#e1306c]',
    sms: 'bg-primary',
    phone: 'bg-secondary',
    web: 'bg-accent',
  }[channel]

  return (
    <div
      className={cx(
        'absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-surface',
        bg
      )}
      title={channel}
    >
      {icon}
    </div>
  )
}

export function ConversationItem({
  name,
  preview,
  time,
  unread = false,
  unreadCount,
  channel = 'whatsapp',
  avatarText,
  selected = false,
  onClick,
  trailing,
  className,
}: ConversationItemProps) {
  const initial = avatarText || (name ? name.trim().charAt(0) : '؟')

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'group flex w-full items-center gap-3 rounded-[16px] border p-3.5 transition-all text-start',
        unread
          ? 'border-border-strong bg-surface'
          : 'border-border bg-surface hover:border-border-strong/60',
        selected && 'border-primary bg-primary-light/30 shadow-sm',
        onClick && 'cursor-pointer active:scale-[0.99]',
        className
      )}
    >
      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cx(
              'truncate font-semibold',
              unread ? 'text-[15px] text-text' : 'text-[14px] text-text'
            )}
          >
            {name}
          </span>
          <span
            className={cx(
              'shrink-0 text-[12px] font-medium',
              unread ? 'text-accent-text font-semibold' : 'text-text-muted'
            )}
          >
            {time}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 text-[13px] leading-relaxed text-text-muted">
            {preview}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {trailing}
            {unread && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {unreadCount ?? 1}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Avatar */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-[15px] font-semibold text-primary">
        <span>{initial}</span>
        <ChannelDot channel={channel} />
      </div>
    </div>
  )
}
