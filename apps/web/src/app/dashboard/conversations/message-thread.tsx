'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { Bot, FileText, ImageIcon, Loader2, Mic, Paperclip } from 'lucide-react'
import { ChatBubble, type ChatBubbleType } from '@/components/ui/chat-bubble'
import type { ThreadMessage } from '@/lib/inbox/messages'
import { mediaBadgeFor, type MediaBadge } from '@/lib/inbox/media-badge'
import { loadOlderMessagesAction } from './actions'
import { appendOptimistic, confirmOptimistic, failOptimistic, outboundTickFor, reconcileWithServer, type InboxMessage } from '@/lib/inbox/optimistic'
import { INBOX_OPTIMISTIC_EVENT, type InboxOptimisticDetail } from '@/lib/inbox/optimistic-events'

const MEDIA_ICONS = { audio: Mic, image: ImageIcon, document: FileText, other: Paperclip } as const

function MediaBadgeChip({ badge }: { badge: MediaBadge }) {
  const Icon = MEDIA_ICONS[badge.kind]
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden rounded-2xl border border-secondary/15 bg-primary-light/60 px-3 py-2 text-[12px] text-secondary">
      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{badge.title}</span>
        {badge.rejected ? <span className="shrink-0 rounded-full bg-surface px-1.5 text-[10px] font-medium text-text-muted">لم يُحلَّل</span> : null}
      </span>
      {badge.detail ? <span className="line-clamp-3 break-words leading-5 text-text">{badge.detail}</span> : null}
    </div>
  )
}

function bubbleFor(message: ThreadMessage, customerName: string, aiEnabled: boolean): { type: ChatBubbleType; sender: string } {
  if (message.direction === 'inbound') return { type: 'customer', sender: customerName }
  switch (message.senderType) {
    case 'ai': return { type: 'ai', sender: 'المساعد الذكي' }
    case 'human_whatsapp': return { type: 'human', sender: 'أنت · من تطبيق واتساب' }
    case 'human_dashboard': return { type: 'human', sender: 'فريق العمل' }
    case 'system': return { type: 'system', sender: 'النظام' }
    // Rows written before sender_type existed keep the previous heuristic.
    default: return aiEnabled ? { type: 'ai', sender: 'المساعد الذكي' } : { type: 'human', sender: 'فريق العمل' }
  }
}

export function MessageThread({
  conversationId,
  initialMessages,
  initialCursor,
  customerName,
  aiEnabled,
  timezone,
}: {
  conversationId: string
  initialMessages: ThreadMessage[]
  initialCursor: string | null
  customerName: string
  aiEnabled: boolean
  timezone: string
}) {
  const [messages, setMessages] = useState<InboxMessage[]>(initialMessages)
  const [cursor, setCursor] = useState(initialCursor)
  const [error, setError] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()
  const topRef = useRef<HTMLDivElement>(null)
  const restoreFrom = useRef<{ height: number; top: number } | null>(null)
  const lastInitialId = initialMessages[initialMessages.length - 1]?.id

  // Server refreshes (new message sent/received) replace the newest page.
  const [syncedId, setSyncedId] = useState(lastInitialId)
  if (lastInitialId !== syncedId) {
    setSyncedId(lastInitialId)
    setMessages((current) => reconcileWithServer(current, initialMessages))
  }

  useEffect(() => {
    function onOptimistic(event: Event) {
      const detail = (event as CustomEvent<InboxOptimisticDetail>).detail
      if (!detail || detail.conversationId !== conversationId) return
      setMessages((current) => {
        if (detail.kind === 'append') return appendOptimistic(current, detail)
        if (detail.kind === 'confirm') return confirmOptimistic(current, detail.clientId, detail.confirmed, detail.delivery)
        return failOptimistic(current, detail.clientId)
      })
    }
    window.addEventListener(INBOX_OPTIMISTIC_EVENT, onOptimistic)
    return () => window.removeEventListener(INBOX_OPTIMISTIC_EVENT, onOptimistic)
  }, [conversationId])

  const scroller = () => topRef.current?.closest('.conversation-messages') as HTMLElement | null

  useLayoutEffect(() => {
    const element = scroller()
    if (!element) return
    if (restoreFrom.current) {
      element.scrollTop = element.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
    } else {
      element.scrollTop = element.scrollHeight
    }
  }, [messages])

  function loadOlder() {
    if (!cursor || loading) return
    setError(null)
    startTransition(async () => {
      const result = await loadOlderMessagesAction(conversationId, cursor)
      if (!result.ok) { setError(result.error); return }
      const element = scroller()
      if (element) restoreFrom.current = { height: element.scrollHeight, top: element.scrollTop }
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id))
        return [...result.page.messages.filter((message) => !known.has(message.id)), ...current]
      })
      setCursor(result.page.olderCursor)
    })
  }

  const formatter = new Intl.DateTimeFormat('ar', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <div ref={topRef} className="flex justify-center">
        {cursor ? (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-xs font-semibold text-text disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            تحميل الرسائل الأقدم
          </button>
        ) : messages.length ? (
          <span className="rounded-full border border-border/70 bg-surface/80 px-3 py-1 text-[11px] text-text-muted">بداية المحادثة</span>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-center text-xs text-error">{error}</p> : null}

      {!messages.length ? (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-text-muted">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-text-muted">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </span>
          لا توجد رسائل سابقة في هذه المحادثة
        </div>
      ) : (
        messages.map((message, index) => {
          const bubble = bubbleFor(message, customerName, aiEnabled)
          const rawBadge = mediaBadgeFor(message.media, message.messageType)
          // The bubble already shows the stored text (transcript / caption + description / file name).
          const badge = rawBadge && rawBadge.detail && message.content.trim().startsWith(rawBadge.detail) ? { ...rawBadge, detail: null } : rawBadge
          const bubbleText = badge?.kind === 'document' && message.content.trim() === badge.title ? 'ملف مرفق' : message.content
          return (
            <div key={message.clientId ?? message.id} className={`flex w-full flex-col gap-1 ${message.direction === 'inbound' ? 'items-start' : 'items-end'}`}>
              {badge ? <div className="min-w-0 max-w-[88%] sm:max-w-[76%]"><MediaBadgeChip badge={badge} /></div> : null}
              <ChatBubble
                type={bubble.type}
                text={bubbleText || (message.messageType !== 'text' ? 'مرفق وسائط' : '')}
                time={formatter.format(new Date(message.createdAt))}
                sender={bubble.sender}
                status={outboundTickFor(messages, index)}
              />
            </div>
          )
        })
      )}
    </>
  )
}
