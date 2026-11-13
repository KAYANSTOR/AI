import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ConversationItem, type ConversationChannel } from '@/components/ui/conversation-item'
import { ListRow } from '@/components/ui/list-row'

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
      .select('id, status, updated_at, last_message_at, unread_count, contacts(full_name, phone), channels(channel_type)')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(3),
    db
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name, phone), services(name)')
      .eq('organization_id', organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3),
  ])

  const conversations = conversationsResult.data ?? []
  const appointments = appointmentsResult.data ?? []

  return (
    <div className="space-y-6">
      {/* 1. Recent Conversations Section (Figma node 8:217) */}
      <div className="space-y-3">
        <SectionHeader
          title="أحدث المحادثات"
          action="فتح الصندوق"
          actionHref="/dashboard/conversations"
        />

        <div className="space-y-2.5">
          {conversations.length === 0 ? (
            // Mock preview fallback matching Figma if no real messages yet
            <>
              <Link href="/dashboard/conversations" className="block">
                <ConversationItem
                  name="سارة أحمد"
                  preview="هل عندكم موعد لتنظيف البشرة الخميس؟"
                  time="الآن"
                  unread
                  unreadCount={1}
                  channel="whatsapp"
                />
              </Link>
              <Link href="/dashboard/conversations" className="block">
                <ConversationItem
                  name="محمد العمري"
                  preview="شكراً، تم تأكيد الحجز"
                  time="10:24"
                  channel="whatsapp"
                />
              </Link>
            </>
          ) : (
            conversations.map((conv) => {
              const contact = conv.contacts as unknown as { full_name: string | null; phone: string | null } | null
              const name = contact?.full_name || contact?.phone || 'عميل كايان'
              const channelType =
                ((conv.channels as unknown as { channel_type: string | null } | null)?.channel_type ??
                  'whatsapp') as ConversationChannel

              const isUnread = (conv.unread_count ?? 0) > 0
              const timeFormatted = conv.last_message_at
                ? formatDateTime(conv.last_message_at, timezone)
                : 'الآن'

              return (
                <Link key={conv.id} href={`/dashboard/conversations/${conv.id}`} className="block">
                  <ConversationItem
                    name={name}
                    preview="محادثة جارية مع العميل..."
                    time={timeFormatted}
                    unread={isUnread}
                    unreadCount={conv.unread_count ?? 1}
                    channel={channelType}
                  />
                </Link>
              )
            })
          )}
        </div>
      </div>

      {/* 2. Upcoming Appointments Section (Figma node 8:314) */}
      <div className="space-y-3">
        <SectionHeader
          title="المواعيد القادمة"
          action="عرض الكل"
          actionHref="/dashboard/appointments"
        />

        <div className="space-y-2.5">
          {appointments.length === 0 ? (
            <Link href="/dashboard/appointments" className="block">
              <ListRow
                title="جلسة تنظيف البشرة"
                subtitle="سارة أحمد"
                trailing="meta"
                meta="الخميس 6:30 م"
                icon={<Calendar className="h-5 w-5" />}
              />
            </Link>
          ) : (
            appointments.map((appt) => {
              const contact = appt.contacts as unknown as { full_name: string | null; phone: string | null } | null
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
      <div className="h-20 w-full rounded-2xl bg-surface border border-border" />
      <div className="h-20 w-full rounded-2xl bg-surface border border-border" />
    </div>
  )
}
