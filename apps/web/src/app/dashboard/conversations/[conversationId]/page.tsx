import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight, Bot, StickyNote, User } from 'lucide-react'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { InboxControls } from '../inbox-controls'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'
import { channelLabel } from '@/lib/i18n/labels'

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

  const { data: conversation } = await ctx.supabase
    .from('conversations')
    .select(
      'id, status, ai_enabled, state, handoff_reason, last_message_at, contacts(full_name, phone), channels(channel_type)'
    )
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!conversation) notFound()

  const [{ data: messages }, { data: notes }] = await Promise.all([
    ctx.supabase
      .from('messages')
      .select('id, direction, content, message_type, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: true })
      .limit(200),
    ctx.supabase
      .from('conversation_notes')
      .select('id, body, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false }),
  ])

  const contact = conversation.contacts as unknown as { full_name: string | null; phone: string | null } | null
  const channel = conversation.channels as unknown as { channel_type: string } | null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/conversations"
          className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted transition-colors hover:text-text"
        >
          <ArrowRight size={13} />
          كل المحادثات
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">
          {contact?.full_name || contact?.phone || ar.conversations.unknownCustomer}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {channel ? channelLabel(channel.channel_type) : ar.common.unknown}
          {contact?.phone ? ` · ${contact.phone}` : ''}
          {conversation.handoff_reason ? ` · ${ar.conversations.handoffReason}: ${conversation.handoff_reason}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">{ar.conversations.thread}</h2>
          </header>
          {!messages?.length ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">{ar.conversations.noMessages}</p>
          ) : (
            <ul className="max-h-[520px] space-y-3 overflow-y-auto p-4">
              {messages.map((message) => {
                const inbound = message.direction === 'inbound'
                return (
                  <li key={message.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        inbound
                          ? 'border border-border bg-background text-text'
                          : 'bg-primary/15 text-text'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content ?? '—'}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
                        {inbound ? <User size={11} /> : <Bot size={11} />}
                        {formatDateTime(message.created_at as string, ctx.timezone)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text">{ar.conversations.controls}</h2>
            <InboxControls
              conversationId={conversationId}
              status={String(conversation.status ?? 'active')}
              aiEnabled={Boolean(conversation.ai_enabled)}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <StickyNote size={15} className="text-primary-dark" />
              <h2 className="text-sm font-semibold text-text">{ar.conversations.notes}</h2>
            </header>
            {!notes?.length ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">{ar.conversations.noNotes}</p>
            ) : (
              <ul className="divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-3">
                    <p className="text-sm text-text">{note.body}</p>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {formatDateTime(note.created_at as string, ctx.timezone)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
