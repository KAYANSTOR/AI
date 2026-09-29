import Link from 'next/link'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { redirect } from 'next/navigation'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'
import { channelLabel, conversationStatusLabel } from '@/lib/i18n/labels'
import { SaveViewForm } from './save-view-form'
import { InboxSearchForm } from './search-form'

const STATUS_FILTERS = [
  { id: 'all', label: 'الكل', status: null as string | null },
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
  const unreadOnly = params.unread === '1'
  const filter = STATUS_FILTERS.find((f) => f.id === view) ?? STATUS_FILTERS[0]

  const { data: savedViews } = await ctx.supabase
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

  let query = ctx.supabase
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.conversations.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.conversations.description}</p>
      </div>

      <InboxSearchForm initialQ={q} unreadOnly={unreadOnly} view={view} />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.id}
            href={buildHref({ view: f.id, q: effectiveQ || undefined, unread: effectiveUnread })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              !params.saved && filter.id === f.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface text-text-muted hover:bg-background'
            }`}
          >
            {f.label}
          </Link>
        ))}
        <Link
          href={buildHref({ view, q: effectiveQ || undefined, unread: !effectiveUnread })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            effectiveUnread
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-surface text-text-muted'
          }`}
        >
          غير مقروء
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(savedViews ?? []).map((v) => (
          <Link
            key={v.id}
            href={buildHref({ saved: v.id })}
            className={`rounded-lg border px-2 py-1 text-xs ${
              params.saved === v.id
                ? 'border-primary bg-primary/10 text-primary-dark'
                : 'border-border text-text-muted'
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

      {!filtered?.length ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          {ar.conversations.empty}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {filtered.map((conversation) => {
            const contact = conversation.contacts as unknown as {
              full_name: string | null
              phone: string | null
            } | null
            const channel = conversation.channels as unknown as { channel_type: string } | null
            const status = String(conversation.status ?? 'active')
            const hasUnread = conversation.unread_count > 0

            return (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/conversations/${conversation.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-background"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {hasUnread && (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    )}
                    <div>
                      <p className={`truncate text-text ${hasUnread ? 'font-bold' : 'font-medium'}`}>
                        {contact?.full_name || contact?.phone || 'عميل غير معروف'}
                      </p>
                      <p
                        className={`mt-0.5 text-xs ${
                          hasUnread ? 'font-medium text-text' : 'text-text-muted'
                        }`}
                      >
                        {channelLabel(channel?.channel_type ?? '')}
                        {' · '}
                        {conversation.ai_enabled
                          ? ar.conversations.agentResponding
                          : ar.conversations.agentPaused}
                        {hasUnread && ` · ${conversation.unread_count} رسالة جديدة`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        status === 'handed_off'
                          ? 'bg-warning/15 text-text'
                          : status === 'closed'
                            ? 'bg-background text-text-muted'
                            : 'bg-success/15 text-text'
                      }`}
                    >
                      {conversationStatusLabel(status)}
                    </span>
                    <time className="whitespace-nowrap text-xs text-text-muted">
                      {conversation.last_message_at
                        ? formatDateTime(conversation.last_message_at as string, ctx.timezone)
                        : ''}
                    </time>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
