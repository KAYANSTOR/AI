import type { DbClient } from '@/lib/db/client'

/** Capability identifiers used across the agent runtime. */
export type CapabilityId =
  | 'lead_capture'
  | 'appointments'
  | 'quotes'
  | 'orders'
  | 'follow_up'
  | 'inbox'
  | 'knowledge_base'

/**
 * Enabled capabilities for one organization.
 * The tool → capability mapping lives only in the tool registry
 * (lib/ai/registry.ts), which is the governance source of truth.
 */
export async function getEnabledCapabilities(
  db: DbClient,
  organizationId: string
): Promise<Set<string>> {
  const { data } = await db
    .from('organization_capabilities')
    .select('capability_id')
    .eq('organization_id', organizationId)
    .eq('is_enabled', true)

  return new Set((data ?? []).map((r) => r.capability_id as string))
}
