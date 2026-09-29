import type { SupabaseClient } from '@supabase/supabase-js'

export const LEAD_STATUSES = [
  'new',
  'qualified',
  'contacted',
  'booked',
  'waiting',
  'won',
  'lost',
  'recovered',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['qualified', 'contacted', 'waiting', 'lost'],
  qualified: ['contacted', 'booked', 'waiting', 'lost', 'won'],
  contacted: ['qualified', 'booked', 'waiting', 'won', 'lost'],
  booked: ['won', 'lost', 'waiting'],
  waiting: ['contacted', 'qualified', 'booked', 'won', 'lost', 'recovered'],
  won: ['recovered'],
  lost: ['recovered', 'contacted'],
  recovered: ['qualified', 'contacted', 'booked', 'won', 'lost'],
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value)
}

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

export class LeadTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeadTransitionError'
  }
}

export async function transitionLead(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    leadId: string
    nextStatus: string
    actorUserId?: string | null
    ownerMemberId?: string | null
    nextAction?: string | null
    nextActionAt?: string | null
    qualificationNotes?: string | null
    source?: string | null
    sourceChannel?: string | null
  }
) {
  if (!isLeadStatus(args.nextStatus)) {
    throw new LeadTransitionError(`invalid status: ${args.nextStatus}`)
  }

  const { data: current, error: readError } = await supabase
    .from('leads')
    .select('id, status, owner_member_id')
    .eq('organization_id', args.organizationId)
    .eq('id', args.leadId)
    .maybeSingle()

  if (readError) throw readError
  if (!current) throw new LeadTransitionError('lead not found')

  const from = isLeadStatus(current.status) ? current.status : 'new'
  if (!canTransitionLead(from, args.nextStatus)) {
    throw new LeadTransitionError(`illegal transition ${from} → ${args.nextStatus}`)
  }

  const patch: Record<string, unknown> = {
    status: args.nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (args.ownerMemberId !== undefined) patch.owner_member_id = args.ownerMemberId
  if (args.nextAction !== undefined) patch.next_action = args.nextAction
  if (args.nextActionAt !== undefined) patch.next_action_at = args.nextActionAt
  if (args.qualificationNotes !== undefined) patch.qualification_notes = args.qualificationNotes
  if (args.source !== undefined) patch.source = args.source
  if (args.sourceChannel !== undefined) patch.source_channel = args.sourceChannel

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('organization_id', args.organizationId)
    .eq('id', args.leadId)
    .select('id, status, owner_member_id, next_action, next_action_at, source, source_channel')
    .single()

  if (error) throw error

  await supabase.from('lead_events').insert({
    lead_id: args.leadId,
    event_type: args.nextStatus === 'recovered' ? 'recovered' : 'created',
    description: `status:${from}->${args.nextStatus}`,
  })

  await supabase.from('audit_events').insert({
    organization_id: args.organizationId,
    actor_type: 'user',
    actor_id: args.actorUserId ?? null,
    action: 'lead.transition',
    entity_type: 'lead',
    entity_id: args.leadId,
    metadata: { from, to: args.nextStatus },
  })

  return data
}
