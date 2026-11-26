import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight, Phone, Sparkles } from 'lucide-react'
import { requireBusinessDashboardCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { InboxControls } from '../inbox-controls'
import { formatDateTime } from '@/lib/i18n/format'
import { channelLabel } from '@/lib/i18n/labels'
import { ChatBubble } from '@/components/ui/chat-bubble'
import { loadConversationMessages } from '@/lib/inbox/messages'
import { MessageThread } from '../message-thread'
import { ReplyComposer } from '../reply-composer'

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params

  let ctx
  try {
    ctx = await requireBusinessDashboardCapability('inbox')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  const { data: conversation } = await ctx.db
    .from('conversations')
    .select('id, status, ai_enabled, state, handoff_reason, last_message_at, contacts(full_name, phone), channels(channel_type)')
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!conversation) notFound()

  const [thread, { data: notes }] = await Promise.all([
    loadConversationMessages(ctx.db, { organizationId: ctx.organizationId, conversationId }),
    ctx.db
      .from('conversation_notes')
      .select('id, body, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false }),
  ])

  const contact = conversation.contacts as unknown as { full_name: string | null; phone: string | null } | null
  const channel = conversation.channels as unknown as { channel_type: string } | null
  const customerName = contact?.full_name || contact?.phone || 'عميل'
  const initials = customerName.trim().slice(0, 1) || 'ع'
  const closed = String(conversation.status ?? '') === 'closed'

  return (
    <section className="conversation-workspace -m-2 flex h-[calc(100dvh-104px)] min-h-[480px] flex-col overflow-hidden sm:m-0 sm:h-[calc(100dvh-150px)]">
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
          <Link
            href="/dashboard/conversations"
            className="dashboard-icon-button h-10 w-10 shrink-0"
            aria-label="العودة إلى صندوق الوارد"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-bold text-secondary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold text-text">{customerName}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
              {contact?.phone && <span dir="ltr">{contact.phone}</span>}
              <span>•</span>
              <span>{channel ? channelLabel(channel.channel_type) : 'واتساب'}</span>
              <span>•</span>
              <span className={closed ? 'text-error' : 'text-success'}>{closed ? 'مغلقة' : 'نشطة'}</span>
            </div>
          </div>
          {contact?.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="dashboard-icon-button h-10 w-10 shrink-0"
              aria-label="الاتصال بالعميل"
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : null}
        </div>

        <div className="border-t border-border/70 px-3 py-2 sm:px-5">
          <InboxControls
            conversationId={conversationId}
            status={String(conversation.status ?? 'active')}
            aiEnabled={Boolean(conversation.ai_enabled)}
          />
        </div>
      </header>

      <div className="conversation-messages min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6">
        <MessageThread
          key={conversationId}
          conversationId={conversationId}
          initialMessages={thread.messages}
          initialCursor={thread.olderCursor}
          customerName={customerName}
          aiEnabled={Boolean(conversation.ai_enabled)}
          timezone={ctx.timezone}
        />

        {notes?.map((note) => (
          <div key={note.id} className="flex w-full justify-end">
            <ChatBubble
              type="note"
              text={note.body}
              sender="ملاحظة داخلية"
              time={formatDateTime(note.created_at as string, ctx.timezone)}
            />
          </div>
        ))}
      </div>

      <footer className="shrink-0 border-t border-border bg-surface px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            {conversation.ai_enabled ? (
              <><Sparkles className="h-3.5 w-3.5 text-secondary" /> المساعد الذكي مفعّل</>
            ) : (
              <><span className="h-2 w-2 rounded-full bg-warning" /> الرد اليدوي</>
            )}
          </span>
          <span>{closed ? 'المحادثة مغلقة' : 'الرد على العميل'}</span>
        </div>
        <ReplyComposer conversationId={conversationId} closed={closed} />
      </footer>
    </section>
  )
}
