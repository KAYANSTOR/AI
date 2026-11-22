import type { DbClient } from '@/lib/db/client'
import { PLAN_LIMITS_BY_CODE, type PlanLimits } from '@/lib/billing/plan-catalog'

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

const TRIAL_LIMITS: PlanLimits = PLAN_LIMITS_BY_CODE.trial

function periodBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export async function getOrganizationPlanLimits(
  db: DbClient,
  organizationId: string
): Promise<{ status: string; limits: PlanLimits; planCode: string }> {
  const { data: sub } = await db
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
  const tierLimits: Record<string, PlanLimits> = PLAN_LIMITS_BY_CODE

  return {
    status: String(sub.status ?? 'active'),
    limits: tierLimits[tier] ?? tierLimits.starter,
    planCode: tier,
  }
}

export async function assertSubscriptionActive(
  db: DbClient,
  organizationId: string
): Promise<void> {
  const { status } = await getOrganizationPlanLimits(db, organizationId)
  if (status === 'suspended' || status === 'cancelled') {
    throw new EntitlementExceededError('subscription', 0, 0)
  }
}

export async function getMeterUsage(
  db: DbClient,
  organizationId: string,
  meterKey: string
): Promise<number> {
  const { start } = periodBounds()

  const { data, error: meterError } = await db
    .from('usage_meters')
    .select('consumed_value')
    .eq('organization_id', organizationId)
    .eq('meter_key', meterKey)
    .eq('period_start', start.toISOString())
    .maybeSingle()

  if (meterError) throw new Error('billing_meter_unavailable')
  if (data) {
    const consumed = Number(data.consumed_value)
    if (!Number.isFinite(consumed) || consumed < 0) throw new Error('billing_meter_invalid')
    return consumed
  }

  const ledgerType =
    meterKey === 'ai_messages'
      ? 'ai_tokens'
      : meterKey === 'campaign_sends'
        ? 'message_outbound'
        : meterKey

  const { data: ledger, error: ledgerError } = await db
    .from('usage_ledger')
    .select('units')
    .eq('organization_id', organizationId)
    .eq('event_type', ledgerType)
    .gte('occurred_at', start.toISOString())

  if (ledgerError) throw new Error('billing_ledger_unavailable')
  const usage = (ledger ?? []).reduce((s, r) => {
    const units = Number(r.units || 0)
    if (!Number.isFinite(units) || units < 0) throw new Error('billing_ledger_invalid')
    return s + units
  }, 0)
  if (!Number.isFinite(usage)) throw new Error('billing_ledger_invalid')
  return usage
}

/** Upsert monthly meter row (best-effort; ledger remains source of truth fallback). */
export async function recordMeterUsage(
  db: DbClient,
  organizationId: string,
  meterKey: string,
  units = 1
): Promise<void> {
  const { start, end } = periodBounds()
  const { data: existing } = await db
    .from('usage_meters')
    .select('id, consumed_value')
    .eq('organization_id', organizationId)
    .eq('meter_key', meterKey)
    .eq('period_start', start.toISOString())
    .maybeSingle()

  if (existing) {
    await db
      .from('usage_meters')
      .update({
        consumed_value: Number(existing.consumed_value || 0) + units,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return
  }

  await db.from('usage_meters').insert({
    organization_id: organizationId,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    meter_key: meterKey,
    consumed_value: units,
  })
}

export async function assertWithinLimit(
  db: DbClient,
  organizationId: string,
  meter: keyof PlanLimits,
  increment = 1
): Promise<void> {
  await assertSubscriptionActive(db, organizationId)
  const { limits } = await getOrganizationPlanLimits(db, organizationId)
  const limit = limits[meter]
  if (limit == null) return

  const used = await getMeterUsage(db, organizationId, meter)
  if (used + increment > limit) {
    throw new EntitlementExceededError(meter, limit, used)
  }
}

export async function loadBillingSnapshot(
  db: DbClient,
  organizationId: string
) {
  const plan = await getOrganizationPlanLimits(db, organizationId)
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
      const { count } = await db
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true)
      usage.channels = count ?? 0
    } else {
      usage[m] = await getMeterUsage(db, organizationId, m)
    }
  }
  return { ...plan, usage }
}
