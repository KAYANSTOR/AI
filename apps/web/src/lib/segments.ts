import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

export type SegmentRule = {
  field: string
  op: 'eq' | 'in' | 'gt' | 'lt' | 'contains'
  value: string | number | string[]
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
      return typeof actual === 'string' && typeof rule.value === 'string' && actual.toLowerCase().includes(rule.value.toLowerCase())
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
