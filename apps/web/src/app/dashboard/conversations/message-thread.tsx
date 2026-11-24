'use client'

import { useLayoutEffect, useRef, useState, useTransition } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { ChatBubble, type ChatBubbleType } from '@/components/ui/chat-bubble'
import type { ThreadMessage } from '@/lib/inbox/messages'
import { loadOlderMessagesAction } from './actions'

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
  const [messages, setMessages] = useState(initialMessages)
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
    setMessages((current) => {
      const known = new Set(initialMessages.map((message) => message.id))
      const older = current.filter((message) => !known.has(message.id) && message.createdAt < (initialMessages[0]?.createdAt ?? ''))
      return [...older, ...initialMessages]
    })
  }

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
        messages.map((message) => {
          const bubble = bubbleFor(message, customerName, aiEnabled)
          return (
            <div key={message.id} className={`flex w-full ${message.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
              <ChatBubble
                type={bubble.type}
                text={message.content || (message.messageType !== 'text' ? 'مرفق وسائط' : '')}
                time={formatter.format(new Date(message.createdAt))}
                sender={bubble.sender}
              />
            </div>
          )
        })
      )}
    </>
  )
}
