import type { SupabaseClient } from '@supabase/supabase-js'

/** Capability IDs aligned with PLAN.md Capability Registry */
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
  supabase: SupabaseClient,
  organizationId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('organization_capabilities')
    .select('capability_id')
    .eq('organization_id', organizationId)
    .eq('is_enabled', true)

  return new Set((data ?? []).map((r) => r.capability_id as string))
}
