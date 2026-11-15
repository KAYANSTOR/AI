'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Loader2, X } from 'lucide-react'
import type { NotificationRow } from '@/lib/notifications'
import { ar } from '@/lib/i18n/ar'

const dateFormatter = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function linkFor(notification: NotificationRow): string | null {
  const entityType = notification.entity_type?.toLowerCase() ?? ''
  if (entityType.includes('conversation')) return `/dashboard/conversations/${notification.entity_id}`
  if (entityType.includes('lead')) return '/dashboard/leads'
  if (entityType.includes('appointment')) return '/dashboard/appointments'
  if (entityType.includes('contact')) return '/dashboard/contacts'
  return null
}

export function NotificationsBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // No state is written before the first `await`, so calling this from an effect
  // stays side-effect-only and never triggers a cascading render.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('notifications_failed')
      const payload = (await res.json()) as { notifications?: NotificationRow[]; unread?: number }
      setItems(payload.notifications ?? [])
      setUnread(payload.unread ?? 0)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Deferred to the next tick on purpose: the unread badge is not needed for first
  // paint, so the fetch must not compete with the page's own data requests.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function toggle() {
    setOpen((value) => !value)
    if (!open) {
      setLoading(true)
      void load()
    }
  }

  async function markAllRead() {
    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id)
    if (unreadIds.length === 0) return
    setItems((current) => current.map((item) => ({ ...item, is_read: true })))
    setUnread(0)
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      // Re-sync from the server if the optimistic update could not be persisted.
      void load()
    }
  }

  async function openNotification(notification: NotificationRow) {
    if (!notification.is_read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      )
      setUnread((value) => Math.max(0, value - 1))
      void fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notification.id }),
      })
    }
    setOpen(false)
    const href = linkFor(notification)
    if (href) router.push(href)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={ar.header.notifications}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-background hover:text-text"
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute end-1.5 top-1.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={ar.header.notifications}
          className="absolute end-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-text">{ar.header.notifications}</h2>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-primary-dark transition-colors hover:bg-primary-light/20"
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  تعليم الكل كمقروء
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={ar.common.close}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-background hover:text-text"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {ar.common.loading}
              </div>
            ) : failed ? (
              <p className="px-4 py-8 text-center text-xs text-error">
                تعذّر تحميل الإشعارات. حاول مرة أخرى.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-text-muted">
                لا توجد إشعارات جديدة.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className={`w-full px-4 py-3 text-start transition-colors hover:bg-background ${
                        notification.is_read ? '' : 'bg-primary-light/10'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            notification.is_read ? 'bg-transparent' : 'bg-primary'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text">{notification.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                            {notification.body}
                          </p>
                          <p className="mt-1 text-[10px] text-text-muted">
                            {dateFormatter.format(new Date(notification.created_at))}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
