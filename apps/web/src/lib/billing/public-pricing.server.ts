import { createAdminClient } from '@/lib/db/admin'
import { isDatabaseConfigured } from '@/lib/db/pool'
import {
  buildPublicPricing,
  staticPublicPricing,
  type PlanPriceRow,
  type PlanRow,
  type PublicPricing,
} from '@/lib/billing/public-pricing'

export async function loadPublicPricing(): Promise<PublicPricing> {
  try {
    // The build container cannot reach Railway's private DB; ISR refreshes from the DB at runtime.
    if (!isDatabaseConfigured() || process.env.NEXT_PHASE === 'phase-production-build') return staticPublicPricing()
    const db = createAdminClient()
    const [plansResult, pricesResult] = await Promise.all([
      db.from('plans').select('id, code, name, description, monthly_price, currency, limits, is_active').eq('is_active', true),
      db.from('plan_prices').select('plan_id, billing_cycle, currency, amount, is_active').eq('is_active', true),
    ])
    if (plansResult.error) throw new Error(plansResult.error.message)
    // plan_prices arrived in 0074; a missing table still lets base plan prices show.
    const priceRows = pricesResult.error ? [] : ((pricesResult.data ?? []) as PlanPriceRow[])
    return buildPublicPricing((plansResult.data ?? []) as PlanRow[], priceRows)
  } catch (error) {
    console.error('public_pricing_fallback_static', error instanceof Error ? error.message : error)
    return staticPublicPricing()
  }
}
