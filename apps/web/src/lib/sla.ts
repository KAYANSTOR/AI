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

/**
 * Classify a conversation against its armed deadlines.
 *
 * The at-risk band is the last (1 - warningRatio) of the deadline's *own* window, which is
 * why the window lengths are inputs: a 24-hour resolution deadline must warn for hours, while
 * a 15-minute first-response deadline must warn for minutes. Sizing that band from a fixed
 * default window made the warning — and the escalation it triggers — nearly unreachable for
 * every policy that was not the default.
 */
export function evaluateSlaState(input: {
  now?: Date
  firstResponseDueAt?: string | null
  resolutionDueAt?: string | null
  firstRespondedAt?: string | null
  resolvedAt?: string | null
  /** Length of the first-response window this deadline was armed with. */
  firstResponseMinutes?: number
  /** Length of the resolution window this deadline was armed with. */
  resolutionMinutes?: number
  warningRatio?: number
}): SlaState {
  if (input.resolvedAt) return 'resolved'

  const now = (input.now ?? new Date()).getTime()
  const warningRatio = clampWarningRatio(input.warningRatio)

  const deadlines: Array<{ dueAt: number; windowMinutes: number }> = []

  if (!input.firstRespondedAt && input.firstResponseDueAt) {
    const dueAt = new Date(input.firstResponseDueAt).getTime()
    if (!Number.isNaN(dueAt)) {
      deadlines.push({
        dueAt,
        windowMinutes: input.firstResponseMinutes ?? DEFAULT_SLA_POLICY.firstResponseMinutes,
      })
    }
  }
  if (input.resolutionDueAt) {
    const dueAt = new Date(input.resolutionDueAt).getTime()
    if (!Number.isNaN(dueAt)) {
      deadlines.push({
        dueAt,
        windowMinutes: input.resolutionMinutes ?? DEFAULT_SLA_POLICY.resolutionMinutes,
      })
    }
  }

  if (deadlines.length === 0) return 'normal'

  const nearest = deadlines.reduce((a, b) => (b.dueAt < a.dueAt ? b : a))
  if (now >= nearest.dueAt) return 'breached'

  const riskBandMs = nearest.windowMinutes * 60_000 * (1 - warningRatio)
  return nearest.dueAt - now <= riskBandMs ? 'at_risk' : 'normal'
}

function clampWarningRatio(value: number | undefined): number {
  const ratio = value ?? DEFAULT_SLA_POLICY.warningRatio
  if (!Number.isFinite(ratio) || ratio < 0) return DEFAULT_SLA_POLICY.warningRatio
  return ratio > 1 ? 1 : ratio
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

  const policy = await loadDefaultSlaPolicy(supabase, input.organizationId)
  const sla_state = evaluateSlaState({
    firstResponseDueAt: data.first_response_due_at,
    resolutionDueAt: data.resolution_due_at,
    firstRespondedAt: at,
    resolvedAt: data.resolved_at,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    warningRatio: policy.warningRatio,
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

  const policy = await loadDefaultSlaPolicy(supabase, input.organizationId)
  const next = evaluateSlaState({
    firstResponseDueAt: data.first_response_due_at,
    resolutionDueAt: data.resolution_due_at,
    firstRespondedAt: data.first_responded_at,
    resolvedAt: data.resolved_at,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    warningRatio: policy.warningRatio,
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
