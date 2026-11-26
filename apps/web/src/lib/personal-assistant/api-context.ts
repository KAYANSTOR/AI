import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/server'
import { createAdminClient } from '@/lib/db/admin'
import { getCurrentOrg } from '@/lib/org'
import type { DbClient } from '@/lib/db/client'
import { loadPersonalAssistantAccess, PERSONAL_ASSISTANT_FORBIDDEN } from './access'
import { canUseBusinessExecutiveAgent, organizationAgentKind } from './executive/specialized-agents'

export type PersonalApiContext = {
  /** Session client (RLS: the caller's own rows only). */
  db: DbClient
  /** Trusted writes after the owner was verified. */
  admin: DbClient
  owner: { organizationId: string; userId: string }
}

export type AccessDeps = {
  getOrg: typeof getCurrentOrg
  sessionDb: () => Promise<DbClient>
  adminDb: () => DbClient
  hasAccess: (db: DbClient, organizationId: string) => Promise<boolean>
}

/** 401 when signed out, 403 when the sector/add-on does not include the personal assistant. */
export async function requirePersonalAssistantApi(overrides: Partial<AccessDeps> = {}): Promise<PersonalApiContext | NextResponse> {
  const deps: AccessDeps = {
    getOrg: getCurrentOrg,
    sessionDb: createClient,
    adminDb: createAdminClient,
    hasAccess: (_db, organizationId) => loadPersonalAssistantAccess(createAdminClient(), organizationId),
    ...overrides,
  }
  const org = await deps.getOrg()
  if (!org) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = await deps.sessionDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user || user.id !== org.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await deps.hasAccess(db, org.organizationId))) {
    return NextResponse.json(PERSONAL_ASSISTANT_FORBIDDEN, { status: 403 })
  }
  return { db, admin: deps.adminDb(), owner: { organizationId: org.organizationId, userId: user.id } }
}

export type OwnerAssistantApiContext = PersonalApiContext & {
  role: 'owner' | 'admin'
}

export async function requireExecutiveAssistantApi(overrides: Partial<AccessDeps> = {}) {
  const getOrg = overrides.getOrg ?? getCurrentOrg
  const adminDb = overrides.adminDb ?? createAdminClient
  return requirePersonalAssistantApi({
    ...overrides,
    hasAccess: overrides.hasAccess ?? (async (db, organizationId) => {
      if (await loadPersonalAssistantAccess(adminDb(), organizationId)) return true
      const org = await getOrg()
      return Boolean(org && canUseBusinessExecutiveAgent(await organizationAgentKind(db, organizationId), org.role))
    }),
  })
}

/** 401 when signed out, 403 when not eligible or not an organization owner/admin. */
export async function requireOwnerAssistantApi(
  overrides: Partial<AccessDeps> = {}
): Promise<OwnerAssistantApiContext | NextResponse> {
  const getOrg = overrides.getOrg ?? getCurrentOrg
  const org = await getOrg()
  if (!org) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const access = await requireExecutiveAssistantApi(overrides)
  if (access instanceof NextResponse) return access

  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json({ error: 'owner_permission_required' }, { status: 403 })
  }

  const { data: membership, error } = await access.admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', access.owner.organizationId)
    .eq('user_id', access.owner.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'owner_lookup_failed' }, { status: 500 })
  const dbRole = typeof membership?.role === 'string' ? membership.role : ''
  if (dbRole !== 'owner' && dbRole !== 'admin') {
    return NextResponse.json({ error: 'owner_permission_required' }, { status: 403 })
  }

  return { ...access, role: dbRole }
}
