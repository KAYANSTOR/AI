import { PLAN_CATALOG, type PlanLimits } from '@/lib/billing/plan-catalog'

/**
 * Public /pricing catalog, read from PostgreSQL (`plans` + `plan_prices`) so visitors see
 * exactly what the owner console saved. The static catalog is used only when the database
 * cannot be read (build time, outage) — never merged over live prices.
 */

export type PublicPrice = { monthly: number | null; yearly: number | null }

export type PublicPlan = {
  code: string
  name: string
  nameEn: string
  description: string
  featured: boolean
  limits: PlanLimits
  /** Prices keyed by ISO currency code. */
  prices: Record<string, PublicPrice>
}

export type PublicPricing = {
  source: 'database' | 'static'
  currencies: string[]
  defaultCurrency: string
  plans: PublicPlan[]
}

export type PlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  monthly_price: number | string | null
  currency: string | null
  limits: Partial<PlanLimits> | null
  is_active: boolean | null
}

export type PlanPriceRow = {
  plan_id: string
  billing_cycle: 'monthly' | 'yearly' | string
  currency: string
  amount: number | string
  is_active: boolean | null
}

const CURRENCY_ORDER = ['USD', 'YER', 'SAR']

export const CURRENCY_LABELS: Record<string, string> = {
  USD: 'دولار أمريكي',
  YER: 'ريال يمني',
  SAR: 'ريال سعودي',
}

export function staticPublicPricing(): PublicPricing {
  return {
    source: 'static',
    currencies: ['USD'],
    defaultCurrency: 'USD',
    plans: PLAN_CATALOG.map((plan) => ({
      code: plan.code,
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description,
      featured: plan.featured,
      limits: plan.limits,
      prices: { USD: { monthly: plan.monthlyPrice, yearly: plan.annualPrice } },
    })),
  }
}

function amount(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/** Pure mapping from DB rows to the public catalog (unit-tested). */
export function buildPublicPricing(planRows: PlanRow[], priceRows: PlanPriceRow[]): PublicPricing {
  const activePlans = planRows.filter((row) => row.is_active !== false)
  if (!activePlans.length) return staticPublicPricing()

  const staticByCode = new Map(PLAN_CATALOG.map((plan) => [plan.code as string, plan]))
  const fallbackLimits = PLAN_CATALOG[0].limits
  const currencies = new Set<string>()

  const plans = activePlans.map((row) => {
    const prices: Record<string, PublicPrice> = {}
    const base = normalizeCurrency(row.currency) ?? 'USD'
    const baseMonthly = amount(row.monthly_price)
    if (baseMonthly !== null) {
      prices[base] = { monthly: baseMonthly, yearly: null }
      currencies.add(base)
    }
    for (const price of priceRows) {
      if (price.plan_id !== row.id || price.is_active === false) continue
      const currency = normalizeCurrency(price.currency)
      const value = amount(price.amount)
      if (!currency || value === null) continue
      const entry = (prices[currency] ??= { monthly: null, yearly: null })
      if (price.billing_cycle === 'yearly') entry.yearly = value
      else if (price.billing_cycle === 'monthly') entry.monthly = value
      currencies.add(currency)
    }
    const known = staticByCode.get(row.code)
    return {
      code: row.code,
      name: row.name || known?.name || row.code,
      nameEn: known?.nameEn ?? row.code.charAt(0).toUpperCase() + row.code.slice(1),
      description: row.description || known?.description || '',
      featured: known?.featured ?? false,
      limits: { ...(known?.limits ?? fallbackLimits), ...(row.limits ?? {}) } as PlanLimits,
      prices,
    }
  })

  const usd = (plan: PublicPlan) => plan.prices.USD?.monthly ?? plan.prices[Object.keys(plan.prices)[0]]?.monthly ?? 0
  plans.sort((a, b) => usd(a) - usd(b) || a.code.localeCompare(b.code))

  const ordered = [...currencies].sort((a, b) => {
    const ia = CURRENCY_ORDER.indexOf(a)
    const ib = CURRENCY_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
  const list = ordered.length ? ordered : ['USD']
  return { source: 'database', currencies: list, defaultCurrency: list.includes('USD') ? 'USD' : list[0], plans }
}

/** Price shown for a cycle; yearly falls back to 10× monthly ("two months free"). */
export function resolvePlanPrice(plan: PublicPlan, currency: string, cycle: 'monthly' | 'yearly'): number | null {
  const entry = plan.prices[currency]
  if (!entry) return null
  if (cycle === 'monthly') return entry.monthly
  if (entry.yearly !== null) return entry.yearly
  return entry.monthly === null ? null : entry.monthly * 10
}

export function formatPlanPrice(value: number | null, currency: string): string {
  if (value === null) return '—'
  if (value === 0) return 'مجاناً'
  const digits = currency === 'YER' ? 0 : value % 1 === 0 ? 0 : 2
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (currency === 'USD') return `$${formatted}`
  if (currency === 'YER') return `${formatted} ر.ي`
  if (currency === 'SAR') return `${formatted} ر.س`
  return `${formatted} ${currency}`
}
