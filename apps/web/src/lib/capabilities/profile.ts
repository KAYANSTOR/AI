import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type BusinessType = {
  id: string
  name: string
  description: string | null
}

export type Capability = {
  id: string
  name: string
  description: string | null
}

export type OrgProfile = {
  organizationId: string
  businessTypeId: string | null
  businessTypeName: string | null
  enabledCapabilities: string[]
  setupComplete: boolean
}

export const NAV_CAPABILITY: Record<string, string | null> = {
  '/dashboard': null,
  '/dashboard/conversations': 'inbox',
  '/dashboard/appointments': 'appointments',
  '/dashboard/leads': 'lead_capture',
  '/dashboard/contacts': 'lead_capture',
  '/dashboard/services': 'appointments',
  '/dashboard/knowledge': 'knowledge_base',
  // Channels, the agent, hours and locations are always available: every business needs a
  // way in, an agent, and a schedule, so they are not capability modules.
  '/dashboard/channels': null,
  '/dashboard/agent': null,
  '/dashboard/hours': null,
  '/dashboard/locations': null,
  '/dashboard/setup': null,
  '/dashboard/settings': null,
}

export async function getOrgProfile(organizationId: string): Promise<OrgProfile> {
  const supabase = await createClient()

  const [{ data: profile }, { data: caps }] = await Promise.all([
    supabase
      .from('business_profiles')
      .select('business_type_id, business_types(name)')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_capabilities')
      .select('capability_id')
      .eq('organization_id', organizationId)
      .eq('is_enabled', true),
  ])

  const businessTypeId = profile?.business_type_id ?? null
  const bt = profile?.business_types as unknown as { name: string } | null
  const enabledCapabilities = (caps ?? []).map((c) => c.capability_id as string)

  return {
    organizationId,
    businessTypeId,
    businessTypeName: bt?.name ?? null,
    enabledCapabilities,
    setupComplete: Boolean(businessTypeId && enabledCapabilities.length > 0),
  }
}

export async function listBusinessTypes(): Promise<BusinessType[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_types')
    .select('id, name, description')
    .order('name')
  return (data ?? []) as BusinessType[]
}

export async function applyBusinessType(
  supabase: SupabaseClient,
  organizationId: string,
  businessTypeId: string,
  enabledIds?: string[]
): Promise<void> {
  const { error: pErr } = await supabase
    .from('business_profiles')
    .update({ business_type_id: businessTypeId })
    .eq('organization_id', organizationId)

  if (pErr) throw new Error(pErr.message)

  let ids = enabledIds
  if (!ids) {
    const { data: defaults } = await supabase
      .from('business_type_capabilities')
      .select('capability_id')
      .eq('business_type_id', businessTypeId)
      .eq('is_default', true)
    ids = (defaults ?? []).map((d) => d.capability_id as string)
  }

  await supabase.from('organization_capabilities').delete().eq('organization_id', organizationId)

  if (ids.length) {
    const { error } = await supabase.from('organization_capabilities').insert(
      ids.map((capability_id) => ({
        organization_id: organizationId,
        capability_id,
        is_enabled: true,
      }))
    )
    if (error) throw new Error(error.message)
  }
}

export async function setCapabilityEnabled(
  supabase: SupabaseClient,
  organizationId: string,
  capabilityId: string,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    const { error } = await supabase.from('organization_capabilities').upsert(
      {
        organization_id: organizationId,
        capability_id: capabilityId,
        is_enabled: true,
      },
      { onConflict: 'organization_id,capability_id' }
    )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('organization_capabilities')
      .update({ is_enabled: false })
      .eq('organization_id', organizationId)
      .eq('capability_id', capabilityId)
    if (error) throw new Error(error.message)
  }
}
