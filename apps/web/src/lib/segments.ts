import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

export type SegmentRule = {
  field: string
  op: 'eq' | 'in' | 'gt' | 'lt' | 'contains'
  value: string | number | string[]
}

export type SegmentCriteria = {
  tags?: string[]
  leadStatuses?: string[]
  hasPhone?: boolean
  rules?: SegmentRule[]
}

export type SegmentEvaluation = {
  contactId: string
  matches: boolean
  reason: string[]
}

function matchesRule(record: Record<string, unknown>, rule: SegmentRule): boolean {
  const actual = record[rule.field]

  switch (rule.op) {
    case 'eq':
      return actual === rule.value
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(String(actual))
    case 'gt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value
    case 'lt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual < rule.value
    case 'contains':
      return (
        typeof actual === 'string' &&
        typeof rule.value === 'string' &&
        actual.toLowerCase().includes(rule.value.toLowerCase())
      )
    default:
      return false
  }
}

export async function evaluateSegment(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string,
  rules: SegmentRule[]
): Promise<SegmentEvaluation> {
  if (rules.length === 0) {
    return { contactId, matches: true, reason: ['segment has no rules'] }
  }

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', contactId)
    .maybeSingle()

  if (error) throw error
  if (!contact) {
    return { contactId, matches: false, reason: ['contact not found'] }
  }

  const reason: string[] = []
  const matches = rules.every((rule) => {
    const ok = matchesRule(contact as Record<string, unknown>, rule)
    if (!ok) reason.push(`rule failed: ${rule.field} ${rule.op}`)
    return ok
  })

  return { contactId, matches, reason }
}

export async function createSegment(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    businessId?: string | null
    name: string
    description?: string
    criteria: SegmentCriteria
    createdBy?: string | null
  }
) {
  const { data, error } = await supabase
    .from('segments')
    .insert({
      organization_id: input.organizationId,
      business_id: input.businessId ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      criteria: input.criteria,
      created_by: input.createdBy ?? null,
    })
    .select('id, name, criteria')
    .single()

  if (error) throw error
  return data
}

/** Resolve contact IDs for simple tag/status/phone criteria (AND). */
export async function resolveSegmentContactIds(
  supabase: SupabaseClient,
  organizationId: string,
  criteria: SegmentCriteria,
  limit = 500
): Promise<string[]> {
  let query = supabase
    .from('contacts')
    .select('id, phone, tags')
    .eq('organization_id', organizationId)
    .limit(limit)

  if (criteria.hasPhone) {
    query = query.not('phone', 'is', null)
  }

  const { data: contacts, error } = await query
  if (error) throw error

  let rows = contacts ?? []

  if (criteria.tags?.length) {
    const required = new Set(criteria.tags.map((t) => t.toLowerCase()))
    rows = rows.filter((c) => {
      const tags = Array.isArray(c.tags) ? (c.tags as string[]) : []
      const normalized = tags.map((x) => String(x).toLowerCase())
      return [...required].every((t) => normalized.includes(t))
    })
  }

  let ids = rows.map((c) => c.id as string)

  if (criteria.leadStatuses?.length && ids.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('contact_id')
      .eq('organization_id', organizationId)
      .in('status', criteria.leadStatuses)
      .in('contact_id', ids)

    const withLead = new Set((leads ?? []).map((l) => l.contact_id as string))
    ids = ids.filter((id) => withLead.has(id))
  }

  if (criteria.rules?.length) {
    const filtered: string[] = []
    for (const id of ids) {
      const result = await evaluateSegment(supabase, organizationId, id, criteria.rules)
      if (result.matches) filtered.push(id)
    }
    ids = filtered
  }

  return ids
}
