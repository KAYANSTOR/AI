import Link from 'next/link'
import { Calendar, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ConversationItem, type ConversationChannel } from '@/components/ui/conversation-item'
import { ListRow } from '@/components/ui/list-row'
import { MobileEmptyState } from '@/components/ui/empty-state'

export async function DashboardActivitySection({
  organizationId,
  timezone,
}: {
  organizationId: string
  timezone: string
}) {
  const db = await createClient()

  const [conversationsResult, appointmentsResult] = await Promise.all([
    db
      .from('conversations')
      .select(
        'id, status, updated_at, last_message_at, unread_count, contacts(full_name, phone), channels(channel_type)'
      )
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(5),
    db
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name, phone), services(name)')
      .eq('organization_id', organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
  ])

  const conversations = conversationsResult.data ?? []
  const appointments = appointmentsResult.data ?? []

  const conversationIds = conversations.map((c) => c.id)
  const previewByConversation = new Map<string, string>()

  if (conversationIds.length > 0) {
    const { data: recentMessages } = await db
      .from('messages')
      .select('conversation_id, content, created_at')
      .eq('organization_id', organizationId)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(40)

    for (const msg of recentMessages ?? []) {
      if (!previewByConversation.has(msg.conversation_id) && msg.content) {
        previewByConversation.set(msg.conversation_id, String(msg.content).slice(0, 120))
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeader
          title="أحدث المحادثات"
          action="فتح الصندوق"
          actionHref="/dashboard/conversations"
        />

        <div className="space-y-2.5">
          {conversations.length === 0 ? (
            <MobileEmptyState
              icon={<MessageSquare className="h-8 w-8" aria-hidden="true" />}
              title="لا توجد محادثات بعد"
              description="ستظهر هنا آخر محادثات العملاء بعد ربط قناة وبدء التواصل."
              action={
                <Link
                  href="/dashboard/channels"
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  ربط قناة
                </Link>
              }
            />
          ) : (
            conversations.map((conv) => {
              const contact = conv.contacts as unknown as
                | { full_name: string | null; phone: string | null }
                | null
              const name = contact?.full_name || contact?.phone || 'عميل'
              const channelType = ((
                conv.channels as unknown as { channel_type: string | null } | null
              )?.channel_type ?? 'whatsapp') as ConversationChannel

              const isUnread = (conv.unread_count ?? 0) > 0
              const timeFormatted = conv.last_message_at
                ? formatDateTime(conv.last_message_at, timezone)
                : formatDateTime(conv.updated_at, timezone)

              return (
                <Link key={conv.id} href={`/dashboard/conversations/${conv.id}`} className="block">
                  <ConversationItem
                    name={name}
                    preview={previewByConversation.get(conv.id) || 'بدون نص معاينة بعد'}
                    time={timeFormatted}
                    unread={isUnread}
                    unreadCount={conv.unread_count ?? 0}
                    channel={channelType}
                  />
                </Link>
              )
            })
          )}
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeader title="المواعيد القادمة" action="عرض الكل" actionHref="/dashboard/appointments" />

        <div className="space-y-2.5">
          {appointments.length === 0 ? (
            <MobileEmptyState
              icon={<Calendar className="h-8 w-8" aria-hidden="true" />}
              title="لا مواعيد قادمة"
              description="المواعيد المؤكدة والمجدولة ستظهر هنا تلقائياً."
              action={
                <Link
                  href="/dashboard/appointments"
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text"
                >
                  إدارة المواعيد
                </Link>
              }
            />
          ) : (
            appointments.map((appt) => {
              const contact = appt.contacts as unknown as
                | { full_name: string | null; phone: string | null }
                | null
              const service = appt.services as unknown as { name: string | null } | null
              const title = service?.name || 'موعد خدمة'
              const subtitle = contact?.full_name || contact?.phone || 'عميل'
              const timeFormatted = formatDateTime(appt.starts_at, timezone)

              return (
                <Link key={appt.id} href="/dashboard/appointments" className="block">
                  <ListRow
                    title={title}
                    subtitle={subtitle}
                    trailing="meta"
                    meta={timeFormatted}
                    icon={<Calendar className="h-5 w-5" />}
                  />
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export function DashboardActivitySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-36 rounded bg-border" />
      <div className="h-20 w-full rounded-2xl border border-border bg-surface" />
      <div className="h-20 w-full rounded-2xl border border-border bg-surface" />
    </div>
  )
}
