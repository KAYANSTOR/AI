import type { SupabaseClient } from '@supabase/supabase-js'

export type SlaState = 'normal' | 'at_risk' | 'breached' | 'resolved'

export type SlaPolicy = {
  firstResponseMinutes: number
  resolutionMinutes: number
  warningRatio: number
}

export const DEFAULT_SLA_POLICY: SlaPolicy = {
  firstResponseMinutes: 15,
  resolutionMinutes: 1440,
  warningRatio: 0.75,
}

export function computeDueAt(from: Date, minutes: number): string {
  return new Date(from.getTime() + minutes * 60_000).toISOString()
}

export function evaluateSlaState(input: {
  now?: Date
  firstResponseDueAt?: string | null
  resolutionDueAt?: string | null
  firstRespondedAt?: string | null
  resolvedAt?: string | null
  warningRatio?: number
}): SlaState {
  if (input.resolvedAt) return 'resolved'

  const now = (input.now ?? new Date()).getTime()
  const warningRatio = input.warningRatio ?? DEFAULT_SLA_POLICY.warningRatio

  const dueCandidates: number[] = []
  if (!input.firstRespondedAt && input.firstResponseDueAt) {
    const t = new Date(input.firstResponseDueAt).getTime()
    if (!Number.isNaN(t)) dueCandidates.push(t)
  }
  if (input.resolutionDueAt) {
    const t = new Date(input.resolutionDueAt).getTime()
    if (!Number.isNaN(t)) dueCandidates.push(t)
  }

  if (dueCandidates.length === 0) return 'normal'

  const nearest = Math.min(...dueCandidates)
  if (now >= nearest) return 'breached'

  // at_risk when remaining time is under (1 - warningRatio) of the original window is
  // approximated: if we are past warningRatio of the way to the due timestamp from "now-ish".
  // Practical rule: within the last 25% of time before due → at_risk.
  const windowMs = nearest - (now - (nearest - now))
  // Simpler: mark at_risk when less than 25% of policy first-response window remains,
  // using absolute proximity of 0.25 * nearest-due gap from creation is unavailable here,
  // so use: if due within 25% of firstResponse default minutes.
  const proximityMs = nearest - now
  const riskWindowMs = DEFAULT_SLA_POLICY.firstResponseMinutes * 60_000 * (1 - warningRatio)
  if (proximityMs <= riskWindowMs) return 'at_risk'

  return 'normal'
}

export async function loadDefaultSlaPolicy(
  supabase: SupabaseClient,
  organizationId: string
): Promise<SlaPolicy> {
  const { data } = await supabase
    .from('sla_policies')
    .select('first_response_minutes, resolution_minutes, warning_ratio')
    .eq('organization_id', organizationId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()

  if (!data) return DEFAULT_SLA_POLICY
  return {
    firstResponseMinutes: Number(data.first_response_minutes) || DEFAULT_SLA_POLICY.firstResponseMinutes,
    resolutionMinutes: Number(data.resolution_minutes) || DEFAULT_SLA_POLICY.resolutionMinutes,
    warningRatio: Number(data.warning_ratio) || DEFAULT_SLA_POLICY.warningRatio,
  }
}

/** Seed first-response / resolution deadlines when an inbound opens a conversation. */
export async function armConversationSla(
  supabase: SupabaseClient,
  input: { organizationId: string; conversationId: string; inboundAt?: Date }
): Promise<void> {
  const policy = await loadDefaultSlaPolicy(supabase, input.organizationId)
  const from = input.inboundAt ?? new Date()

  const { data: existing } = await supabase
    .from('conversations')
    .select('first_response_due_at, first_responded_at')
    .eq('id', input.conversationId)
    .maybeSingle()

  if (existing?.first_response_due_at || existing?.first_responded_at) return

  await supabase
    .from('conversations')
    .update({
      first_response_due_at: computeDueAt(from, policy.firstResponseMinutes),
      resolution_due_at: computeDueAt(from, policy.resolutionMinutes),
      sla_state: 'normal',
    })
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
}

export async function markFirstResponse(
  supabase: SupabaseClient,
  input: { organizationId: string; conversationId: string; at?: Date }
): Promise<void> {
  const at = (input.at ?? new Date()).toISOString()
  const { data } = await supabase
    .from('conversations')
    .select('first_responded_at, first_response_due_at, resolution_due_at, resolved_at')
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (!data || data.first_responded_at) return

  const sla_state = evaluateSlaState({
    firstResponseDueAt: data.first_response_due_at,
    resolutionDueAt: data.resolution_due_at,
    firstRespondedAt: at,
    resolvedAt: data.resolved_at,
  })

  await supabase
    .from('conversations')
    .update({ first_responded_at: at, sla_state })
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
}

export async function refreshConversationSla(
  supabase: SupabaseClient,
  input: { organizationId: string; conversationId: string }
): Promise<SlaState> {
  const { data } = await supabase
    .from('conversations')
    .select('first_response_due_at, resolution_due_at, first_responded_at, resolved_at, sla_state')
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (!data) return 'normal'

  const next = evaluateSlaState({
    firstResponseDueAt: data.first_response_due_at,
    resolutionDueAt: data.resolution_due_at,
    firstRespondedAt: data.first_responded_at,
    resolvedAt: data.resolved_at,
  })

  if (next !== data.sla_state) {
    const patch: Record<string, unknown> = { sla_state: next }
    if (next === 'breached') patch.sla_breached_at = new Date().toISOString()
    await supabase
      .from('conversations')
      .update(patch)
      .eq('id', input.conversationId)
      .eq('organization_id', input.organizationId)
  }

  return next
}
