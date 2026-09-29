import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'

export type DashboardContext = OrgContext & {
  businessId: string | null
  businessTypeId: string | null
  timezone: string
  enabledCapabilities: string[]
  setupComplete: boolean
}

export const getDashboardContext = cache(
  async (): Promise<DashboardContext | null> => {
    const org = await getCurrentOrg()
    if (!org) return null

    const supabase = await createClient()
    const [{ data: profile, error: profileError }, { data: capabilities, error: capabilitiesError }] =
      await Promise.all([
        supabase
          .from('business_profiles')
          .select('business_id, business_type_id, timezone')
          .eq('organization_id', org.organizationId)
          .maybeSingle(),
        supabase
          .from('organization_capabilities')
          .select('capability_id')
          .eq('organization_id', org.organizationId)
          .eq('is_enabled', true),
      ])
    if (profileError || capabilitiesError) {
      console.error('Unable to load dashboard context', { profileError, capabilitiesError })
    }
    const enabledCapabilities = (capabilities ?? []).map((row) => row.capability_id as string)
    const businessTypeId = (profile?.business_type_id as string | null) ?? null

    return {
      ...org,
      businessId: (profile?.business_id as string | null) ?? null,
      businessTypeId,
      timezone: (profile?.timezone as string | null) || 'UTC',
      enabledCapabilities,
      setupComplete: Boolean(businessTypeId && enabledCapabilities.length > 0),
    }
  }
)
