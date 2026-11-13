import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MessageSquare, Phone, Radio, ListTodo, History } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { channelLabel } from '@/lib/i18n/labels'

export const dynamic = 'force-dynamic'

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const { contactId } = await params
  const db = await createClient()

  const { data: contact } = await db
    .from('contacts')
    .select('id, full_name, phone, email, created_at')
    .eq('organization_id', context.organizationId)
    .eq('id', contactId)
    .maybeSingle()

  if (!contact) notFound()

  const { data: conversations } = await db
    .from('conversations')
    .select('id, channel_type, status, updated_at')
    .eq('organization_id', context.organizationId)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(10)

  const latestConversation = conversations?.[0]
  const preferredChannel = latestConversation?.channel_type || 'whatsapp'
  const displayName = contact.full_name || 'عميل'
  const initial = displayName.slice(0, 1)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">ملف العميل</h1>
        <p className="mt-1 text-sm text-text-muted">معلومات التواصل وسجل التفاعل مع العميل.</p>
      </div>

      {/* Profile header */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl font-bold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-text">{displayName}</p>
            <p className="text-sm text-text-muted">
              عميل عبر {channelLabel(preferredChannel, preferredChannel)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                {channelLabel(preferredChannel, preferredChannel)}
              </span>
              {(conversations?.length || 0) > 1 && (
                <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  عميل متكرر
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {latestConversation && (
            <Link
              href={`/dashboard/conversations/${latestConversation.id}`}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              فتح المحادثة
            </Link>
          )}
          <Link
            href="/dashboard/tasks"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-text"
          >
            <ListTodo className="h-4 w-4" />
            مهمة جديدة
          </Link>
        </div>
      </div>

      <section className="space-y-2.5">
        <SectionHeader title="معلومات التواصل" />
        <ListRow
          title="رقم الهاتف"
          subtitle={contact.phone ? 'مسجّل على القناة' : 'غير متوفر'}
          meta={contact.phone || '—'}
          trailing="meta"
          icon={<Phone className="h-5 w-5" />}
        />
        <ListRow
          title="القناة المفضلة"
          subtitle={latestConversation ? 'آخر نشاط مسجّل' : 'لم تُحدد بعد'}
          meta={channelLabel(preferredChannel, preferredChannel)}
          trailing="meta"
          icon={<Radio className="h-5 w-5" />}
        />
      </section>

      <section className="space-y-2.5">
        <SectionHeader
          title="سجل التواصل"
          action={
            latestConversation ? (
              <Link href={`/dashboard/conversations/${latestConversation.id}`} className="text-sm font-semibold text-primary">
                عرض الكل
              </Link>
            ) : undefined
          }
        />

        {(conversations ?? []).length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">
            لا يوجد سجل تواصل بعد لهذا العميل.
          </p>
        ) : (
          (conversations ?? []).map((conversation) => (
            <Link key={conversation.id} href={`/dashboard/conversations/${conversation.id}`} className="block">
              <ListRow
                title={`محادثة ${channelLabel(conversation.channel_type, conversation.channel_type)}`}
                subtitle={conversation.status || 'نشطة'}
                meta={formatDateTime(conversation.updated_at, context.timezone)}
                trailing="meta"
                icon={<History className="h-5 w-5" />}
              />
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
