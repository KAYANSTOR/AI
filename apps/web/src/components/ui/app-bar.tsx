'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Bell, MoreHorizontal, Search, Sparkles } from 'lucide-react'
import { cx } from './cx'

export type AppBarProps = {
  type?: 'root' | 'detail'
  title?: string
  subtitle?: string
  onBack?: () => void
  onSearch?: () => void
  onNotifications?: () => void
  hasUnreadNotifications?: boolean
  trailingAction?: ReactNode
  className?: string
}

export function AppBar({
  type = 'root',
  title = 'كايان AI',
  subtitle = 'لوحة التحكم',
  onBack,
  onSearch,
  onNotifications,
  hasUnreadNotifications = false,
  trailingAction,
  className,
}: AppBarProps) {
  const router = useRouter()

  if (type === 'detail') {
    return (
      <header
        className={cx(
          'flex h-16 w-full items-center justify-between gap-3 border-b border-border/80 bg-surface px-4 sm:px-6',
          className
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (onBack) onBack()
            else router.back()
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:bg-surface-muted active:scale-95"
          aria-label="الرجوع للخلف"
        >
          <ArrowRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
        </button>

        <h1 className="flex-1 truncate text-center text-[17px] font-semibold text-text">
          {title}
        </h1>

        <div className="flex shrink-0 items-center justify-center">
          {trailingAction || (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:bg-surface-muted"
              aria-label="المزيد من الخيارات"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
    )
  }

  return (
    <header
      className={cx(
        'flex h-16 w-full items-center justify-between gap-3 border-b border-border/80 bg-surface px-4 sm:px-6',
        className
      )}
    >
      {/* Leading brand lockup */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          {subtitle && (
            <span className="text-[12px] font-medium leading-tight text-text-muted">
              {subtitle}
            </span>
          )}
          <span className="text-[17px] font-semibold leading-tight text-text">
            {title}
          </span>
        </div>
      </div>

      {/* Trailing actions */}
      <div className="flex items-center gap-2">
        {trailingAction}
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:bg-surface-muted"
            aria-label="بحث"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {onNotifications && (
          <button
            type="button"
            onClick={onNotifications}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:bg-surface-muted"
            aria-label="الإشعارات"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {hasUnreadNotifications && (
              <span className="absolute top-2 end-2 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
