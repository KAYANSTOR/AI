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

const TRIAL_LIMITS: PlanLimits = {
  channels: 1,
  voice_minutes: 30,
  ai_messages: 100,
  automation_runs: 50,
  campaign_sends: 50,
}

function periodBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export async function getOrganizationPlanLimits(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ status: string; limits: PlanLimits; planCode: string }> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan_id, plan_tier, plans(limits, code)')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!sub) {
    return { status: 'trial', limits: { ...TRIAL_LIMITS }, planCode: 'trial' }
  }

  const plans = sub.plans as unknown as { limits?: PlanLimits; code?: string } | null
  if (plans?.limits) {
    return {
      status: String(sub.status ?? 'active'),
      limits: plans.limits,
      planCode: plans.code ?? 'custom',
    }
  }

  // Legacy subscriptions without plans join (0000 schema used plan_tier).
  const tier = String(sub.plan_tier ?? 'starter')
  const tierLimits: Record<string, PlanLimits> = {
    trial: TRIAL_LIMITS,
    starter: { channels: 2, voice_minutes: 100, ai_messages: 1000, automation_runs: 200, campaign_sends: 200 },
    growth: { channels: 5, voice_minutes: 500, ai_messages: 5000, automation_runs: 1000, campaign_sends: 2000 },
    pro: { channels: 10, voice_minutes: 2000, ai_messages: 20000, automation_runs: 5000, campaign_sends: 10000 },
  }

  return {
    status: String(sub.status ?? 'active'),
    limits: tierLimits[tier] ?? tierLimits.starter,
    planCode: tier,
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

export async function getMeterUsage(
  supabase: SupabaseClient,
  organizationId: string,
  meterKey: string
): Promise<number> {
  const { start } = periodBounds()

  const { data } = await supabase
    .from('usage_meters')
    .select('consumed_value')
    .eq('organization_id', organizationId)
    .eq('meter_key', meterKey)
    .eq('period_start', start.toISOString())
    .maybeSingle()

  if (data) return Number(data.consumed_value) || 0

  const ledgerType =
    meterKey === 'ai_messages'
      ? 'ai_tokens'
      : meterKey === 'campaign_sends'
        ? 'message_outbound'
        : meterKey

  const { data: ledger } = await supabase
    .from('usage_ledger')
    .select('units')
    .eq('organization_id', organizationId)
    .eq('event_type', ledgerType)
    .gte('created_at', start.toISOString())

  return (ledger ?? []).reduce((s, r) => s + Number(r.units || 0), 0)
}

/** Upsert monthly meter row (best-effort; ledger remains source of truth fallback). */
export async function recordMeterUsage(
  supabase: SupabaseClient,
  organizationId: string,
  meterKey: string,
  units = 1
): Promise<void> {
  const { start, end } = periodBounds()
  const { data: existing } = await supabase
    .from('usage_meters')
    .select('id, consumed_value')
    .eq('organization_id', organizationId)
    .eq('meter_key', meterKey)
    .eq('period_start', start.toISOString())
    .maybeSingle()

  if (existing) {
    await supabase
      .from('usage_meters')
      .update({
        consumed_value: Number(existing.consumed_value || 0) + units,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return
  }

  await supabase.from('usage_meters').insert({
    organization_id: organizationId,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    meter_key: meterKey,
    consumed_value: units,
  })
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

export async function loadBillingSnapshot(
  supabase: SupabaseClient,
  organizationId: string
) {
  const plan = await getOrganizationPlanLimits(supabase, organizationId)
  const meters: (keyof PlanLimits)[] = [
    'ai_messages',
    'voice_minutes',
    'channels',
    'automation_runs',
    'campaign_sends',
  ]
  const usage: Record<string, number> = {}
  for (const m of meters) {
    if (m === 'channels') {
      const { count } = await supabase
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true)
      usage.channels = count ?? 0
    } else {
      usage[m] = await getMeterUsage(supabase, organizationId, m)
    }
  }
  return { ...plan, usage }
}
