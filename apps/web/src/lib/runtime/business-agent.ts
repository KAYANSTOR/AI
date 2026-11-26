import type { DbClient } from '@/lib/db/client'

type BusinessAgent = {
  id: string
  organization_id: string
  business_id: string
  name: string
  slug?: string | null
  model_provider: string
  temperature: number | null
  locale: string | null
  status: string
  created_at: string | null
}

/** Shared selection for setup, preview and live customer runtime. No cross-tenant fallback. */
export async function selectBusinessAgent(
  db: DbClient, organizationId: string, businessId: string, activeOnly = true
): Promise<BusinessAgent | null> {
  const { data, error } = await db.from('ai_agents')
    .select('id, organization_id, business_id, name, slug, model_provider, temperature, locale, status, created_at')
    .eq('organization_id', organizationId)
    .eq('business_id', businessId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = [...(data ?? []) as BusinessAgent[]].sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.id.localeCompare(b.id))
  const canonical = rows.find((row) => row.slug === 'frontdesk' && row.status === 'active')
    ?? rows.find((row) => row.slug === 'frontdesk')
  // Never let an auxiliary agent silently replace an inactive canonical front desk.
  // Legacy businesses without a canonical slug keep their existing active agent.
  const selected = canonical ?? rows.find((row) => row.status === 'active') ?? rows[0]
  return selected && (!activeOnly || selected.status === 'active') ? selected : null
}
