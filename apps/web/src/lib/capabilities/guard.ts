import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { getEnabledCapabilities } from '@/lib/ai/capabilities'

/**
 * The server-side capability gate.
 *
 * Hiding a nav item is presentation, not enforcement: every route and every server action
 * that belongs to a capability passes through here, so a disabled capability is refused on
 * the server even when someone reaches the URL directly. This mirrors the runtime, which
 * independently refuses the same capability's tools.
 */
export class CapabilityDisabledError extends Error {
  constructor(public readonly capability: string) {
    super(`الميزة "${capability}" غير مُفعّلة لهذه الشركة.`)
    this.name = 'CapabilityDisabledError'
  }
}

export class NotAuthorizedError extends Error {
  constructor(message = 'هذه العملية متاحة لمالك الشركة أو المدير فقط.') {
    super(message)
    this.name = 'NotAuthorizedError'
  }
}

export type AuthorizedContext = OrgContext & {
  supabase: SupabaseClient
  /** The active business for this organization; null until setup has run. */
  businessId: string | null
}

async function buildContext(org: OrgContext): Promise<AuthorizedContext> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('business_id')
    .eq('organization_id', org.organizationId)
    .maybeSingle()

  return { ...org, supabase, businessId: profile?.business_id ?? null }
}

/** Requires an authenticated member. Throws when there is no session. */
export async function requireMember(): Promise<AuthorizedContext> {
  const org = await getCurrentOrg()
  if (!org) throw new NotAuthorizedError('يجب تسجيل الدخول أولًا.')
  return buildContext(org)
}

/**
 * Requires an authenticated member of an organization with the capability enabled.
 * The enabled set is read from the database, never from the caller.
 */
export async function requireCapability(capability: string): Promise<AuthorizedContext> {
  const ctx = await requireMember()
  const enabled = await getEnabledCapabilities(ctx.supabase, ctx.organizationId)
  if (!enabled.has(capability)) throw new CapabilityDisabledError(capability)
  return ctx
}

/** Requires owner/admin — the role that may change configuration. */
export async function requireAdminCapability(capability: string | null): Promise<AuthorizedContext> {
  const ctx = capability ? await requireCapability(capability) : await requireMember()
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new NotAuthorizedError()
  return ctx
}

/**
 * Records a sensitive operation in the audit trail through the membership-guarded
 * database function. Failures are surfaced rather than swallowed: an unaudited
 * configuration change is not an acceptable outcome.
 */
export async function audit(
  ctx: AuthorizedContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await ctx.supabase.rpc('log_audit_event', {
    p_organization_id: ctx.organizationId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_business_id: ctx.businessId,
    p_metadata: metadata,
  })
  if (error) throw new Error(error.message)
}
