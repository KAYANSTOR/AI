import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ConversationsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from('conversations')
    .select(
      'id, status, ai_enabled, last_message_at, contacts(full_name, phone), channels(channel_type)'
    )
    .eq('organization_id', org.organizationId)
    .order('last_message_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Unified Inbox</h1>
        <p className="text-slate-500 text-sm mt-1">
          Phone + WhatsApp conversations in one place (Phase 2).
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {!conversations?.length ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No conversations yet. Inbound WhatsApp or phone events will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((c) => {
              const contact = c.contacts as unknown as {
                full_name: string | null
                phone: string | null
              } | null
              const channel = c.channels as unknown as { channel_type: string } | null

              return (
                <li key={c.id} className="px-4 py-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {contact?.full_name || contact?.phone || 'Unknown'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(channel?.channel_type ?? 'channel').toUpperCase()}
                        {c.ai_enabled ? ' · AI on' : ' · AI off'}
                      </p>
                    </div>
                    <time className="text-xs text-slate-400 whitespace-nowrap">
                      {c.last_message_at
                        ? new Date(c.last_message_at).toLocaleString()
                        : ''}
                    </time>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
