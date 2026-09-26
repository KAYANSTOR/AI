import { createClient } from '@/lib/supabase/server'

export type OrgContext = {
  userId: string
  organizationId: string
  organizationName: string
  role: string
}

/**
 * Resolve the authenticated user's primary organization.
 * Phase 1 assumes one org per user (owner). Multi-org comes later.
 */
export async function getCurrentOrg(): Promise<OrgContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const org = membership.organizations as unknown as { name: string } | null

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    organizationName: org?.name ?? 'Organization',
    role: membership.role,
  }
}
