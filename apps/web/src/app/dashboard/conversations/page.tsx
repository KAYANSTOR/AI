import Link from 'next/link'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { redirect } from 'next/navigation'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'
import { SaveViewForm } from './save-view-form'
import { InboxSearchForm } from './search-form'
import { Chip } from '@/components/ui/chip'
import { SectionHeader } from '@/components/ui/section-header'
import { ConversationItem, type ConversationChannel } from '@/components/ui/conversation-item'
import { MobileEmptyState } from '@/components/ui/empty-state'

const STATUS_FILTERS = [
  { id: 'all', label: 'الكل', status: null as string | null },
  { id: 'unread', label: 'غير مقروءة', status: null as string | null, unreadOnly: true },
  { id: 'active', label: 'نشطة', status: 'active' },
  { id: 'handed_off', label: 'مُسلَّمة', status: 'handed_off' },
  { id: 'closed', label: 'مغلقة', status: 'closed' },
] as const

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; q?: string; unread?: string; saved?: string }>
}) {
  let ctx
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-text">
          <p className="font-semibold">{ar.conversations.disabledNotice}</p>
          <p className="mt-1 text-text-muted">
            {ar.conversations.enableInstructionsBefore}{' '}
            <Link href="/dashboard/settings" className="font-semibold underline">
              الإعدادات
            </Link>{' '}
            {ar.conversations.enableInstructionsAfter}
          </p>
        </div>
      )
    }
    redirect('/login')
  }

  const params = (await searchParams) ?? {}
  const view = params.view ?? 'all'
  const q = (params.q ?? '').trim()
  const unreadOnly = params.unread === '1' || view === 'unread'
  const filter = STATUS_FILTERS.find((f) => f.id === view) ?? STATUS_FILTERS[0]

  const { data: savedViews } = await ctx.db
    .from('saved_inbox_views')
    .select('id, name, filters, is_shared')
    .eq('organization_id', ctx.organizationId)
    .order('name')
    .limit(30)

  let savedFilter: { status?: string; q?: string; unreadOnly?: boolean } | null = null
  if (params.saved) {
    const match = (savedViews ?? []).find((v) => v.id === params.saved)
    if (match?.filters && typeof match.filters === 'object') {
      savedFilter = match.filters as { status?: string; q?: string; unreadOnly?: boolean }
    }
  }

  const effectiveStatus = savedFilter?.status ?? filter.status
  const effectiveQ = savedFilter?.q ?? q
  const effectiveUnread = savedFilter?.unreadOnly ?? unreadOnly

  let query = ctx.db
    .from('conversations')
    .select(
      'id, status, ai_enabled, state, last_message_at, unread_count, contacts(full_name, phone), channels(channel_type)'
    )
    .eq('organization_id', ctx.organizationId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (effectiveStatus) query = query.eq('status', effectiveStatus)
  if (effectiveUnread) query = query.gt('unread_count', 0)

  const { data: conversations } = await query

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id)
  const latestMessageByConversation = new Map<string, string>()

  if (conversationIds.length > 0) {
    const { data: recentMessages } = await ctx.db
      .from('messages')
      .select('conversation_id, content, created_at')
      .eq('organization_id', ctx.organizationId)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(3000)

    for (const message of recentMessages ?? []) {
      const conversationId = String(message.conversation_id)
      if (!latestMessageByConversation.has(conversationId) && message.content) {
        latestMessageByConversation.set(conversationId, String(message.content))
      }
    }
  }

  const filtered = !effectiveQ
    ? conversations
    : (conversations ?? []).filter((c) => {
        const contact = c.contacts as unknown as {
          full_name: string | null
          phone: string | null
        } | null
        const hay = `${contact?.full_name ?? ''} ${contact?.phone ?? ''}`.toLowerCase()
        return hay.includes(effectiveQ.toLowerCase())
      })

  const buildHref = (opts: {
    view?: string
    q?: string
    unread?: boolean
    saved?: string
  }) => {
    const sp = new URLSearchParams()
    if (opts.saved) sp.set('saved', opts.saved)
    else {
      if (opts.view && opts.view !== 'all') sp.set('view', opts.view)
      if (opts.q) sp.set('q', opts.q)
      if (opts.unread) sp.set('unread', '1')
    }
    const s = sp.toString()
    return s ? `/dashboard/conversations?${s}` : '/dashboard/conversations'
  }

  // Partition conversations into Today vs Earlier
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const todayConversations = (filtered ?? []).filter((c) => {
    if (!c.last_message_at) return false
    return new Date(c.last_message_at).getTime() >= startOfToday
  })

  const earlierConversations = (filtered ?? []).filter((c) => {
    if (!c.last_message_at) return true
    return new Date(c.last_message_at).getTime() < startOfToday
  })

  return (
    <div className="space-y-5">
      {/* Search Bar */}
      <InboxSearchForm initialQ={q} unreadOnly={unreadOnly} view={view} />

      {/* Filter Chips (Figma node 11:442) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_FILTERS.map((f) => {
          const isSelected = view === f.id
          return (
            <Link
              key={f.id}
              href={buildHref({
                view: f.id,
                q: effectiveQ || undefined,
                unread: 'unreadOnly' in f ? Boolean(f.unreadOnly) : undefined,
              })}
            >
              <Chip label={f.label} selected={isSelected} />
            </Link>
          )
        })}
      </div>

      {/* Saved Views row */}
      {savedViews && savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {savedViews.map((v) => (
            <Link
              key={v.id}
              href={buildHref({ saved: v.id })}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                params.saved === v.id
                  ? 'border-secondary bg-primary/10 text-secondary'
                  : 'border-border text-text-muted hover:border-border-strong'
              }`}
            >
              {v.name}
            </Link>
          ))}
          <SaveViewForm
            filters={{
              status: filter.status,
              q: q || null,
              unreadOnly,
            }}
          />
        </div>
      )}

      {/* Conversations List */}
      {!filtered || filtered.length === 0 ? (
        <MobileEmptyState
          title="لا توجد محادثات بعد"
          description="ستظهر رسائل واستفسارات عملائك هنا فور استقبال أول رسالة عبر القنوات المربوطة."
          actionLabel="ربط قناة واتساب"
          onAction={undefined}
          action={
            <Link
              href="/dashboard/channels"
              className="mt-2 flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
            >
              ربط القنوات الآن
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Today Group */}
          {todayConversations.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title="اليوم" />
              <div className="space-y-2.5">
                {todayConversations.map((conv) => {
                  const contact = conv.contacts as unknown as {
                    full_name: string | null
                    phone: string | null
                  } | null
                  const name = contact?.full_name || contact?.phone || 'عميل'
                  const channel =
                    ((conv.channels as unknown as { channel_type: string | null } | null)
                      ?.channel_type ?? 'whatsapp') as ConversationChannel
                  const unread = (conv.unread_count ?? 0) > 0
                  const timeStr = conv.last_message_at
                    ? formatDateTime(conv.last_message_at, ctx.timezone)
                    : 'اليوم'

                  return (
                    <Link
                      key={conv.id}
                      href={`/dashboard/conversations/${conv.id}`}
                      className="block"
                    >
                      <ConversationItem
                        name={name}
                        preview={latestMessageByConversation.get(String(conv.id)) ?? ''}
                        time={timeStr}
                        unread={unread}
                        unreadCount={conv.unread_count ?? 1}
                        channel={channel}
                      />
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Earlier Group */}
          {earlierConversations.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title={todayConversations.length > 0 ? 'سابقاً' : 'جميع المحادثات'} />
              <div className="space-y-2.5">
                {earlierConversations.map((conv) => {
                  const contact = conv.contacts as unknown as {
                    full_name: string | null
                    phone: string | null
                  } | null
                  const name = contact?.full_name || contact?.phone || 'عميل'
                  const channel =
                    ((conv.channels as unknown as { channel_type: string | null } | null)
                      ?.channel_type ?? 'whatsapp') as ConversationChannel
                  const unread = (conv.unread_count ?? 0) > 0
                  const timeStr = conv.last_message_at
                    ? formatDateTime(conv.last_message_at, ctx.timezone)
                    : ''

                  return (
                    <Link
                      key={conv.id}
                      href={`/dashboard/conversations/${conv.id}`}
                      className="block"
                    >
                      <ConversationItem
                        name={name}
                        preview={latestMessageByConversation.get(String(conv.id)) ?? ''}
                        time={timeStr}
                        unread={unread}
                        unreadCount={conv.unread_count ?? 1}
                        channel={channel}
                      />
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
