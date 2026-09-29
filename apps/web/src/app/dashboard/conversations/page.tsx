import Link from 'next/link'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { redirect } from 'next/navigation'

const STATUS_LABELS: Record<string, string> = {
  active: 'نشطة',
  handed_off: 'مع موظف',
  closed: 'مغلقة',
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'واتساب',
  instagram: 'إنستغرام',
  sms: 'رسائل نصية',
  phone: 'هاتف',
  website: 'الموقع',
  email: 'بريد',
}

export default async function ConversationsPage() {
  let ctx
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-text">
          <p className="font-semibold">صندوق المحادثات غير مُفعّل لهذه الشركة.</p>
          <p className="mt-1 text-muted">
            فعّل ميزة «صندوق المحادثات» من{' '}
            <Link href="/dashboard/settings" className="font-semibold underline">
              الإعدادات
            </Link>{' '}
            لعرض محادثات العملاء والتحويل البشري.
          </p>
        </div>
      )
    }
    redirect('/login')
  }

  const { data: conversations } = await ctx.supabase
    .from('conversations')
    .select('id, status, ai_enabled, state, last_message_at, contacts(full_name, phone), channels(channel_type)')
    .eq('organization_id', ctx.organizationId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">صندوق المحادثات</h1>
        <p className="mt-1 text-sm text-muted">
          كل محادثات القنوات في مكان واحد، مع حالة الوكيل والتحويل البشري.
        </p>
      </div>

      {!conversations?.length ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          لا توجد محادثات بعد. ستظهر هنا محادثات واتساب والهاتف والرسائل النصية فور وصولها.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {conversations.map((conversation) => {
            const contact = conversation.contacts as unknown as {
              full_name: string | null
              phone: string | null
            } | null
            const channel = conversation.channels as unknown as { channel_type: string } | null
            const status = String(conversation.status ?? 'active')

            return (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/conversations/${conversation.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-background"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">
                      {contact?.full_name || contact?.phone || 'عميل غير معروف'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {CHANNEL_LABELS[channel?.channel_type ?? ''] ?? 'قناة'}
                      {' · '}
                      {conversation.ai_enabled ? 'الوكيل يرد' : 'الوكيل متوقف'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        status === 'handed_off'
                          ? 'bg-warning/15 text-text'
                          : status === 'closed'
                            ? 'bg-background text-muted'
                            : 'bg-success/15 text-text'
                      }`}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </span>
                    <time className="whitespace-nowrap text-xs text-muted">
                      {conversation.last_message_at
                        ? new Date(conversation.last_message_at as string).toLocaleString('ar')
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
