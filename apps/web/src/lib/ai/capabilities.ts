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

/** Map AI tools → required capability (PLAN: Tool Registry per capability) */
export const TOOL_CAPABILITY: Record<string, CapabilityId | null> = {
  get_customer: 'lead_capture',
  find_available_slots: 'appointments',
  create_appointment: 'appointments',
  request_human_handoff: null,
}

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

export function isToolAllowed(toolName: string, enabled: Set<string>): boolean {
  const required = TOOL_CAPABILITY[toolName]
  if (required === undefined) return false
  if (required === null) return true
  return enabled.has(required)
}
