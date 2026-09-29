import type { SupabaseClient } from '@supabase/supabase-js'

export type PlanLimits = {
  channels?: number
  voice_minutes?: number
  ai_messages?: number
  automation_runs?: number
  campaign_sends?: number
}

export class EntitlementExceededError extends Error {
  readonly code = 'entitlement_exceeded' as const
  constructor(
    public readonly meter: string,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(`Plan limit exceeded for ${meter}: ${used}/${limit}`)
    this.name = 'EntitlementExceededError'
  }
}

export async function getOrganizationPlanLimits(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ status: string; limits: PlanLimits }> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan_id, plans(limits, code)')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!sub) {
    return {
      status: 'trial',
      limits: { channels: 1, voice_minutes: 30, ai_messages: 100, automation_runs: 50, campaign_sends: 50 },
    }
  }

  const plans = sub.plans as unknown as { limits?: PlanLimits; code?: string } | null
  return {
    status: String(sub.status),
    limits: (plans?.limits ?? {}) as PlanLimits,
  }
}

export async function assertSubscriptionActive(
  supabase: SupabaseClient,
  organizationId: string
): Promise<void> {
  const { status } = await getOrganizationPlanLimits(supabase, organizationId)
  if (status === 'suspended' || status === 'cancelled') {
    throw new EntitlementExceededError('subscription', 0, 0)
  }
}

/** Count usage for the current calendar month from usage_meters when present. */
export async function getMeterUsage(
  supabase: SupabaseClient,
  organizationId: string,
  meterKey: string
): Promise<number> {
  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('usage_meters')
    .select('consumed_value')
    .eq('organization_id', organizationId)
    .eq('meter_key', meterKey)
    .eq('period_start', periodStart.toISOString())
    .maybeSingle()

  if (data) return Number(data.consumed_value) || 0

  // Fallback: usage_ledger sum for the period
  const { data: ledger } = await supabase
    .from('usage_ledger')
    .select('units')
    .eq('organization_id', organizationId)
    .eq('event_type', meterKey === 'ai_messages' ? 'ai_tokens' : meterKey)
    .gte('created_at', periodStart.toISOString())

  return (ledger ?? []).reduce((s, r) => s + Number(r.units || 0), 0)
}

export async function assertWithinLimit(
  supabase: SupabaseClient,
  organizationId: string,
  meter: keyof PlanLimits,
  increment = 1
): Promise<void> {
  await assertSubscriptionActive(supabase, organizationId)
  const { limits } = await getOrganizationPlanLimits(supabase, organizationId)
  const limit = limits[meter]
  if (limit == null) return

  const used = await getMeterUsage(supabase, organizationId, meter)
  if (used + increment > limit) {
    throw new EntitlementExceededError(meter, limit, used)
  }
}
