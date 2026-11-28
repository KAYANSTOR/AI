import type { DbClient } from '@/lib/db/client'
import { logEvent } from '@/lib/observability/logger'

/**
 * OPS-004 — `billing_payment_providers` is platform configuration, not tenant data.
 * Migration 0074 keeps it service-role only (RLS enabled, no authenticated or anon
 * privilege), because `configuration` may hold provider credentials. The dashboard
 * therefore reads the public catalogue with the admin client and an explicit column
 * allowlist that never includes `configuration`.
 */
export const BILLING_PROVIDER_PUBLIC_COLUMNS = 'code,display_name,provider_type,is_active'

export type PublicPaymentProvider = {
  code: string
  display_name: string
  provider_type: string
  is_active: boolean
}

export async function loadPublicPaymentProviders(db: DbClient): Promise<{
  providers: PublicPaymentProvider[]
  error: string | null
}> {
  const { data, error } = await db
    .from('billing_payment_providers')
    .select(BILLING_PROVIDER_PUBLIC_COLUMNS)
    .eq('is_active', true)
  if (error) {
    // Not silent: the page still renders, but the operational log records that the
    // catalogue could not be read so a grant/RLS regression is visible in Railway.
    logEvent('warn', 'billing_provider_catalog_unavailable', {
      reason: error.message.slice(0, 200),
      code: error.code ?? null,
    })
    return { providers: [], error: error.message }
  }
  return {
    providers: (data ?? []).map((row) => ({
      code: String(row.code ?? ''),
      display_name: String(row.display_name ?? ''),
      provider_type: String(row.provider_type ?? ''),
      is_active: row.is_active === true,
    })),
    error: null,
  }
}

const SECRET_KEY_RE = /(secret|password|passcode|token|api[_-]?key|private[_-]?key|credential|webhook|signature|salt|hash|client[_-]?id)/i

/**
 * Owner/admin responses may echo a provider row after editing. Credential-bearing
 * values are replaced; their keys stay visible so an operator can see what is
 * configured without reading the secret itself.
 */
export function redactProviderConfiguration(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      output[key] = '[redacted]'
      continue
    }
    output[key] = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? redactProviderConfiguration(entry)
      : entry
  }
  return output
}
