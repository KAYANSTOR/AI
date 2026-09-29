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

type CountFilter =
  | { kind: 'in'; column: string; values: string[] }
  | { kind: 'eq'; column: string; value: string }
  | { kind: 'neq'; column: string; value: string }
  | { kind: 'gte'; column: string; value: string }

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
    count(supabase, 'leads', organizationId, {
      kind: 'in',
      column: 'status',
      values: ['new', 'qualified', 'contacted', 'booked', 'waiting', 'recovered'],
    }),
    count(supabase, 'leads', organizationId, { kind: 'eq', column: 'status', value: 'won' }),
    count(supabase, 'conversations', organizationId, { kind: 'neq', column: 'status', value: 'closed' }),
    count(supabase, 'conversations', organizationId, { kind: 'eq', column: 'sla_state', value: 'breached' }),
    count(supabase, 'appointments', organizationId, { kind: 'gte', column: 'starts_at', value: nowIso }),
    count(supabase, 'quotes', organizationId, { kind: 'in', column: 'status', values: ['draft', 'sent'] }),
    count(supabase, 'quotes', organizationId, { kind: 'eq', column: 'status', value: 'accepted' }),
    count(supabase, 'orders', organizationId, {
      kind: 'in',
      column: 'status',
      values: ['draft', 'confirmation', 'processing'],
    }),
    count(supabase, 'orders', organizationId, { kind: 'eq', column: 'status', value: 'completed' }),
    count(supabase, 'followup_enrollments', organizationId, {
      kind: 'in',
      column: 'status',
      values: ['scheduled', 'eligible', 'sending'],
    }),
    count(supabase, 'followup_enrollments', organizationId, {
      kind: 'eq',
      column: 'status',
      value: 'completed',
    }),
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

async function count(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
  filter?: CountFilter
): Promise<number> {
  if (!filter) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
    if (error) return 0
    return count ?? 0
  }

  if (filter.kind === 'in') {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in(filter.column, filter.values)
    if (error) return 0
    return count ?? 0
  }

  if (filter.kind === 'eq') {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq(filter.column, filter.value)
    if (error) return 0
    return count ?? 0
  }

  if (filter.kind === 'neq') {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .neq(filter.column, filter.value)
    if (error) return 0
    return count ?? 0
  }

  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte(filter.column, filter.value)
  if (error) return 0
  return count ?? 0
}
