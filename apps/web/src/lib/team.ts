import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const TEAM_ROLES = ['owner', 'admin', 'manager', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export type TeamMember = {
  id: string
  organization_id: string
  user_id: string
  role: TeamRole
  is_active: boolean
  created_at?: string
}

export class TeamAccessError extends Error {
  constructor(message = 'not authorized') {
    super(message)
    this.name = 'TeamAccessError'
  }
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value)
}

function ensureAdminRole(actorRole: string | null | undefined) {
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    throw new TeamAccessError('not authorized: only owner or admin can manage team members')
  }
}

function ensureRoleChangeAllowed(actorRole: string | null | undefined, nextRole: string): void {
  if (!isTeamRole(nextRole)) {
    throw new TeamAccessError(`invalid role: ${String(nextRole)}`)
  }

  if (actorRole === 'admin' && nextRole === 'owner') {
    throw new TeamAccessError('not authorized: admin cannot assign owner role')
  }
}

export async function listOrganizationMembers(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, role, is_active, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as TeamMember[]
}

export async function addOrganizationMember(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  args: {
    organizationId: string
    actorRole: string | null | undefined
    userId: string
    role: string
    isActive?: boolean
  }
): Promise<TeamMember> {
  ensureAdminRole(args.actorRole)
  if (!isTeamRole(args.role)) {
    throw new TeamAccessError(`invalid role: ${String(args.role)}`)
  }
  if (args.actorRole === 'admin' && args.role === 'owner') {
    throw new TeamAccessError('not authorized: admin cannot assign owner role')
  }

  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: args.organizationId,
      user_id: args.userId,
      role: args.role,
      is_active: args.isActive ?? true,
    })
    .select('id, organization_id, user_id, role, is_active, created_at')
    .single()

  if (error) throw error
  return data as TeamMember
}

export async function updateMemberRole(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  args: {
    organizationId: string
    actorRole: string | null | undefined
    memberId: string
    nextRole: string
  }
): Promise<TeamMember> {
  ensureAdminRole(args.actorRole)
  ensureRoleChangeAllowed(args.actorRole, args.nextRole)

  const { data: current, error: currentError } = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, role, is_active, created_at')
    .eq('organization_id', args.organizationId)
    .eq('id', args.memberId)
    .maybeSingle()

  if (currentError) throw currentError
  if (!current) throw new TeamAccessError('member not found')

  if (current.role === 'owner' && args.nextRole !== 'owner') {
    const { data: owners, error: ownersError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', args.organizationId)
      .eq('role', 'owner')

    if (ownersError) throw ownersError
    if ((owners ?? []).length <= 1) {
      throw new TeamAccessError('cannot remove the last owner from the organization')
    }
  }

  if (args.actorRole === 'admin' && current.role === 'owner') {
    throw new TeamAccessError('not authorized: admin cannot change the owner role')
  }

  const { data, error } = await supabase
    .from('organization_members')
    .update({ role: args.nextRole })
    .eq('organization_id', args.organizationId)
    .eq('id', args.memberId)
    .select('id, organization_id, user_id, role, is_active, created_at')
    .single()

  if (error) throw error
  return data as TeamMember
}
