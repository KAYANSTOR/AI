import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight, MoreHorizontal, Send, Sparkles } from 'lucide-react'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { InboxControls } from '../inbox-controls'
import { formatDateTime } from '@/lib/i18n/format'
import { channelLabel } from '@/lib/i18n/labels'
import { ChatBubble, type ChatBubbleType } from '@/components/ui/chat-bubble'

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params

  let ctx
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  const { data: conversation } = await ctx.db
    .from('conversations')
    .select(
      'id, status, ai_enabled, state, handoff_reason, last_message_at, contacts(full_name, phone), channels(channel_type)'
    )
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!conversation) notFound()

  const [{ data: messages }, { data: notes }] = await Promise.all([
    ctx.db
      .from('messages')
      .select('id, direction, content, message_type, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: true })
      .limit(200),
    ctx.db
      .from('conversation_notes')
      .select('id, body, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false }),
  ])

  const contact = conversation.contacts as unknown as { full_name: string | null; phone: string | null } | null
  const channel = conversation.channels as unknown as { channel_type: string } | null
  const customerName = contact?.full_name || contact?.phone || 'عميل كايان'

  return (
    <div className="flex flex-col h-[calc(100dvh-120px)] max-w-3xl mx-auto -m-2 sm:m-0">
      {/* 1. Top Detail AppBar & Customer Strip (Figma node 13:698 & 13:712) */}
      <div className="flex items-center justify-between border-b border-border/80 bg-surface px-4 py-3 rounded-t-2xl">
        <Link
          href="/dashboard/conversations"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:bg-surface-muted active:scale-95"
          aria-label="الرجوع إلى المحادثات"
        >
          <ArrowRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" />
        </Link>

        {/* Customer Strip */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-start">
            <h1 className="text-[16px] font-semibold text-text leading-tight">{customerName}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                {conversation.ai_enabled ? 'الوكيل نشط' : 'استلام يدوي'}
              </span>
              <span className="text-[11px] text-text-muted">
                {channel ? channelLabel(channel.channel_type) : 'واتساب'}
              </span>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text">
          <MoreHorizontal className="h-5 w-5" />
        </div>
      </div>

      {/* 2. Messages Viewport (Figma node 13:722) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
        {/* System indicator */}
        <ChatBubble
          type="system"
          text={`تم بدء المحادثة عبر ${channel ? channelLabel(channel.channel_type) : 'واتساب'}`}
        />

        {!messages?.length ? (
          <div className="py-12 text-center text-text-muted text-sm">
            لا توجد رسائل سابقة في هذه المحادثة
          </div>
        ) : (
          messages.map((message) => {
            const isInbound = message.direction === 'inbound'
            const bubbleType: ChatBubbleType = isInbound
              ? 'customer'
              : conversation.ai_enabled
              ? 'ai'
              : 'human'

            const sender = isInbound
              ? customerName
              : conversation.ai_enabled
              ? 'كايان AI'
              : 'فريق الدعم'

            const timeFormatted = message.created_at
              ? formatDateTime(message.created_at as string, ctx.timezone)
              : ''

            return (
              <div
                key={message.id}
                className={`flex w-full ${isInbound ? 'justify-end' : 'justify-start'}`}
              >
                <ChatBubble
                  type={bubbleType}
                  text={message.content ?? ''}
                  time={timeFormatted}
                  sender={sender}
                />
              </div>
            )
          })
        )}

        {/* Notes rendered as internal team bubbles */}
        {notes?.map((n) => (
          <div key={n.id} className="flex w-full justify-start">
            <ChatBubble
              type="note"
              text={n.body}
              sender="ملاحظة داخلية"
              time={formatDateTime(n.created_at as string, ctx.timezone)}
            />
          </div>
        ))}
      </div>

      {/* 3. Controls & Composer Bar (Figma node 13:759) */}
      <div className="border-t border-border bg-surface p-3 rounded-b-2xl space-y-2">
        <InboxControls
          conversationId={conversationId}
          status={String(conversation.status ?? 'active')}
          aiEnabled={Boolean(conversation.ai_enabled)}
        />

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="اكتب ردًا سريعًا..."
            className="flex-1 h-11 rounded-full bg-surface-muted px-4 text-sm text-text placeholder:text-text-muted outline-none border border-transparent focus:border-primary/40"
          />
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-95"
            aria-label="إرسال"
          >
            <Send className="h-5 w-5 rtl:-scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  )
}
