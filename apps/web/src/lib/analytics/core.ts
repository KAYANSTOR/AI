import type { DbClient } from '@/lib/db/client'

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
  | { kind: 'eq'; column: string; value: string }
  | { kind: 'neq'; column: string; value: string }
  | { kind: 'gte'; column: string; value: string }
  | { kind: 'in'; column: string; value: string[] }

export async function loadCoreAnalytics(
  db: DbClient,
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
    count(db, 'leads', organizationId),
    count(db, 'leads', organizationId, [
      { kind: 'in', column: 'status', value: ['new', 'qualified', 'contacted', 'booked', 'waiting', 'recovered'] },
    ]),
    count(db, 'leads', organizationId, [{ kind: 'eq', column: 'status', value: 'won' }]),
    count(db, 'conversations', organizationId, [{ kind: 'neq', column: 'status', value: 'closed' }]),
    count(db, 'conversations', organizationId, [{ kind: 'eq', column: 'sla_state', value: 'breached' }]),
    count(db, 'appointments', organizationId, [{ kind: 'gte', column: 'starts_at', value: nowIso }]),
    count(db, 'quotes', organizationId, [{ kind: 'in', column: 'status', value: ['draft', 'sent'] }]),
    count(db, 'quotes', organizationId, [{ kind: 'eq', column: 'status', value: 'accepted' }]),
    count(db, 'orders', organizationId, [
      { kind: 'in', column: 'status', value: ['draft', 'confirmation', 'processing'] },
    ]),
    count(db, 'orders', organizationId, [{ kind: 'eq', column: 'status', value: 'completed' }]),
    count(db, 'followup_enrollments', organizationId, [
      { kind: 'in', column: 'status', value: ['scheduled', 'eligible', 'sending'] },
    ]),
    count(db, 'followup_enrollments', organizationId, [
      { kind: 'eq', column: 'status', value: 'completed' },
    ]),
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
  db: DbClient,
  table: string,
  organizationId: string,
  filters: CountFilter[] = []
): Promise<number> {
  let query = db.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)

  for (const filter of filters) {
    switch (filter.kind) {
      case 'eq':
        query = query.eq(filter.column, filter.value)
        break
      case 'neq':
        query = query.neq(filter.column, filter.value)
        break
      case 'gte':
        query = query.gte(filter.column, filter.value)
        break
      case 'in':
        query = query.in(filter.column, filter.value)
        break
    }
  }

  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}
