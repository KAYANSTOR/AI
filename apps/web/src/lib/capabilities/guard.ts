import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext, type DashboardContext } from '@/lib/dashboard/context'
import { capabilityLabel } from '@/lib/i18n/labels'

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
    super(`الميزة «${capabilityLabel(capability)}» غير مُفعّلة لهذه الشركة.`)
    this.name = 'CapabilityDisabledError'
  }
}

export class NotAuthorizedError extends Error {
  constructor(message = 'هذه العملية متاحة لمالك الشركة أو المدير فقط.') {
    super(message)
    this.name = 'NotAuthorizedError'
  }
}

export type AuthorizedContext = DashboardContext & {
  supabase: SupabaseClient
}

/** Requires an authenticated member. Throws when there is no session. */
export async function requireMember(): Promise<AuthorizedContext> {
  const context = await getDashboardContext()
  if (!context) throw new NotAuthorizedError('يجب تسجيل الدخول أولًا.')
  return { ...context, supabase: await createClient() }
}

/**
 * Requires an authenticated member of an organization with the capability enabled.
 * The enabled set is read from the database, never from the caller.
 */
export async function requireCapability(capability: string): Promise<AuthorizedContext> {
  const ctx = await requireMember()
  if (!ctx.enabledCapabilities.includes(capability)) throw new CapabilityDisabledError(capability)
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
