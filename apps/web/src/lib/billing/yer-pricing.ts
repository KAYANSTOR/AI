/**
 * Expected Yemeni-rial amount for a manual wallet transfer.
 *
 * Precedence: a configured YER plan price (owner-console → plan_prices) wins;
 * otherwise USD × rate, where the rate comes from the YER price row, then the
 * owner-console platform setting `billing.yer_per_usd`, then the YER_PER_USD env.
 * Returns null instead of 0 when no positive rate exists, so the UI never shows "0 ر.ي".
 */
export const YER_RATE_SETTING_KEY = 'billing.yer_per_usd'

export function parseYerRate(value: unknown): number | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>).value
    : value
  const rate = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw.trim()) : NaN
  return Number.isFinite(rate) && rate > 0 && rate < 1_000_000 ? rate : null
}

export function expectedYerAmount(input: {
  usdMonthly: number
  cycle: 'monthly' | 'yearly'
  yerPrice: { amount?: number | null; rate?: number | null } | null
  platformRate: number | null
  envRate: number | null
}): { amountYer: number; rate: number } | null {
  const rate = parseYerRate(input.yerPrice?.rate) ?? parseYerRate(input.platformRate) ?? parseYerRate(input.envRate)
  const configured = Number(input.yerPrice?.amount)
  if (Number.isFinite(configured) && configured > 0) {
    const effectiveRate = rate ?? (input.usdMonthly > 0 ? configured / (input.usdMonthly * (input.cycle === 'yearly' ? 10 : 1)) : 0)
    return { amountYer: Math.round(configured), rate: effectiveRate > 0 ? effectiveRate : 1 }
  }
  if (!rate || !Number.isFinite(input.usdMonthly) || input.usdMonthly <= 0) return null
  const usd = input.usdMonthly * (input.cycle === 'yearly' ? 10 : 1)
  return { amountYer: Math.round(usd * rate), rate }
}

/** Seeded default wallets carry a placeholder until the owner enters the real number. */
export function hasTransferableAccount(accountNumber: string | null | undefined): boolean {
  const value = String(accountNumber ?? '').trim()
  return /\d{3,}/.test(value) && !/^PENDING/i.test(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Supabase client shape
type SettingsReader = { from: (table: string) => any }

/** Owner-console rate (`platform_settings.billing.yer_per_usd`); service-role client only. */
export async function loadPlatformYerRate(adminDb: SettingsReader): Promise<number | null> {
  try {
    const { data } = await adminDb.from('platform_settings').select('value').eq('key', YER_RATE_SETTING_KEY).maybeSingle()
    return parseYerRate(data?.value)
  } catch {
    return null
  }
}

export function envYerRate(): number | null {
  return parseYerRate(process.env.YER_PER_USD)
}
