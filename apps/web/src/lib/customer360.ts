import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

export type CustomerTimelineEvent = {
  id: string
  type: 'conversation' | 'appointment' | 'quote' | 'order'
  occurred_at: string
  summary: string
  metadata: Record<string, unknown>
}

export async function getCustomerTimeline(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string
): Promise<CustomerTimelineEvent[]> {
  const [conversations, appointments, quotes, orders] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, created_at, status, summary')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('id, starts_at, status, notes')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .order('starts_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('id, created_at, status, total')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, created_at, status, total')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
  ])

  const timeline: CustomerTimelineEvent[] = []

  for (const row of conversations.data ?? []) {
    timeline.push({
      id: String(row.id),
      type: 'conversation',
      occurred_at: String(row.created_at ?? new Date().toISOString()),
      summary: `Conversation ${row.status ?? 'active'}`,
      metadata: { status: row.status ?? null, summary: row.summary ?? null },
    })
  }

  for (const row of appointments.data ?? []) {
    timeline.push({
      id: String(row.id),
      type: 'appointment',
      occurred_at: String(row.starts_at ?? new Date().toISOString()),
      summary: `Appointment ${row.status ?? 'pending'}`,
      metadata: { status: row.status ?? null, notes: row.notes ?? null },
    })
  }

  for (const row of quotes.data ?? []) {
    timeline.push({
      id: String(row.id),
      type: 'quote',
      occurred_at: String(row.created_at ?? new Date().toISOString()),
      summary: `Quote ${row.status ?? 'draft'} ${row.total ?? 0}`,
      metadata: { status: row.status ?? null, total: row.total ?? null },
    })
  }

  for (const row of orders.data ?? []) {
    timeline.push({
      id: String(row.id),
      type: 'order',
      occurred_at: String(row.created_at ?? new Date().toISOString()),
      summary: `Order ${row.status ?? 'draft'} ${row.total ?? 0}`,
      metadata: { status: row.status ?? null, total: row.total ?? null },
    })
  }

  return timeline.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
}

export async function getCustomerSummary(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string
): Promise<{ conversations: number; appointments: number; quotes: number; orders: number }> {
  const [conversations, appointments, quotes, orders] = await Promise.all([
    supabase.from('conversations').select('id').eq('organization_id', organizationId).eq('contact_id', contactId),
    supabase.from('appointments').select('id').eq('organization_id', organizationId).eq('contact_id', contactId),
    supabase.from('quotes').select('id').eq('organization_id', organizationId).eq('contact_id', contactId),
    supabase.from('orders').select('id').eq('organization_id', organizationId).eq('contact_id', contactId),
  ])

  return {
    conversations: (conversations.data ?? []).length,
    appointments: (appointments.data ?? []).length,
    quotes: (quotes.data ?? []).length,
    orders: (orders.data ?? []).length,
  }
}
