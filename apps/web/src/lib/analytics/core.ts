import type { SupabaseClient } from '@supabase/supabase-js'

export type CoreAnalytics = {
  leadsTotal: number
  leadsOpen: number
  leadsWon: number
  conversationsOpen: number
  conversationsBreachedSla: number
  appointmentsUpcoming: number
  quotesOpen: number
  quotesAccepted: number
  ordersOpen: number
  ordersCompleted: number
  followupsActive: number
  followupsCompleted: number
}

export async function loadCoreAnalytics(
  supabase: SupabaseClient,
  organizationId: string
): Promise<CoreAnalytics> {
  const nowIso = new Date().toISOString()

  const [
    leadsTotal,
    leadsOpen,
    leadsWon,
    conversationsOpen,
    conversationsBreachedSla,
    appointmentsUpcoming,
    quotesOpen,
    quotesAccepted,
    ordersOpen,
    ordersCompleted,
    followupsActive,
    followupsCompleted,
  ] = await Promise.all([
    count(supabase, 'leads', organizationId),
    count(supabase, 'leads', organizationId, (q) =>
      q.in('status', ['new', 'qualified', 'contacted', 'booked', 'waiting', 'recovered'])
    ),
    count(supabase, 'leads', organizationId, (q) => q.eq('status', 'won')),
    count(supabase, 'conversations', organizationId, (q) => q.neq('status', 'closed')),
    count(supabase, 'conversations', organizationId, (q) => q.eq('sla_state', 'breached')),
    count(supabase, 'appointments', organizationId, (q) => q.gte('starts_at', nowIso)),
    count(supabase, 'quotes', organizationId, (q) => q.in('status', ['draft', 'sent'])),
    count(supabase, 'quotes', organizationId, (q) => q.eq('status', 'accepted')),
    count(supabase, 'orders', organizationId, (q) =>
      q.in('status', ['draft', 'confirmation', 'processing'])
    ),
    count(supabase, 'orders', organizationId, (q) => q.eq('status', 'completed')),
    count(supabase, 'followup_enrollments', organizationId, (q) =>
      q.in('status', ['scheduled', 'eligible', 'sending'])
    ),
    count(supabase, 'followup_enrollments', organizationId, (q) => q.eq('status', 'completed')),
  ])

  return {
    leadsTotal,
    leadsOpen,
    leadsWon,
    conversationsOpen,
    conversationsBreachedSla,
    appointmentsUpcoming,
    quotesOpen,
    quotesAccepted,
    ordersOpen,
    ordersCompleted,
    followupsActive,
    followupsCompleted,
  }
}

type FilterQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>
type FilterFn = (q: FilterQuery) => FilterQuery

async function count(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
  filter?: FilterFn
): Promise<number> {
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)
  if (filter) query = filter(query)
  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}
