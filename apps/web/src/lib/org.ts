import { cache } from 'react'
import { createClient } from '@/lib/db/server'
import { isAuthConfigured } from '@/lib/auth/config'
import { getCurrentUser } from '@/lib/auth/current-user'

export type OrgContext = {
  userId: string
  email: string
  organizationId: string
  organizationName: string
  role: string
}

/** Resolve the authenticated user's primary (earliest) organization membership. */
export const getCurrentOrg = cache(async (): Promise<OrgContext | null> => {
  if (!isAuthConfigured()) return null

  const user = await getCurrentUser()
  if (!user) return null
  const userId = user.id
  const db = await createClient()

  const { data: membership } = await db
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const org = membership.organizations as unknown as { name: string } | null

  return {
    userId,
    email: user.email,
    organizationId: membership.organization_id,
    organizationName: org?.name ?? '—',
    role: membership.role,
  }
})
