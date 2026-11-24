import { NextResponse } from 'next/server'
import type { DbClient } from '@/lib/db/client'
import {
  assertWithinLimit,
  EntitlementExceededError,
  recordMeterUsage,
} from '@/lib/billing/entitlements'

/**
 * DB-backed AI guard (F3) for every dashboard route that calls Gemini/Groq.
 *
 * Before the model is called it checks, in PostgreSQL:
 *   1. the plan quota (`assertWithinLimit` over billing_entitlements / usage_meters / usage_ledger);
 *   2. an hourly rate limit per user and per organization (`consume_ai_rate_limit`), shared
 *      by every Railway replica instead of living in process memory.
 * A rejected call returns 429 with an Arabic message and never reaches the provider.
 * Any failure to evaluate the guard fails closed (503) — an unmetered call is the bug.
 */

export type AiGuardRoute = 'copilot' | 'agent_test' | 'agent_train' | 'setup_draft' | 'reply_test' | 'knowledge'

export type AiGuardContext = {
  organizationId: string
  userId: string
  route: AiGuardRoute
}

export type AiGuardRejection = {
  ok: false
  status: 429 | 503
  code: 'ai_quota_exceeded' | 'ai_rate_limited' | 'ai_guard_unavailable'
  message: string
  retryAfterSeconds?: number
}

export type AiGuardResult = { ok: true } | AiGuardRejection

export type RateLimitVerdict = { allowed: boolean; hits: number; resetAt: Date }

export type AiGuardDeps = {
  assertQuota: (organizationId: string) => Promise<void>
  consumeRateLimit: (scope: 'user' | 'organization', subjectId: string, limit: number) => Promise<RateLimitVerdict>
  recordUsage: (organizationId: string, route: AiGuardRoute, tokens: number) => Promise<void>
  now: () => Date
}

export const AI_GUARD_MESSAGES = {
  quota: 'تم استهلاك حصة الذكاء الاصطناعي في خطتك لهذه الفترة. يرجى ترقية الخطة أو التواصل مع الدعم.',
  userRate: 'لقد تجاوزت الحد المسموح من طلبات الذكاء الاصطناعي لهذه الساعة. حاول مجدداً بعد قليل.',
  orgRate: 'تجاوزت مؤسستك الحد المسموح من طلبات الذكاء الاصطناعي لهذه الساعة. حاول مجدداً بعد قليل.',
  unavailable: 'تعذّر التحقق من حصة الاستخدام حالياً. حاول مجدداً بعد قليل.',
} as const

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

export function aiRateLimits() {
  return {
    perUserPerHour: positiveInt(process.env.AI_RATE_LIMIT_USER_PER_HOUR, 60),
    perOrganizationPerHour: positiveInt(process.env.AI_RATE_LIMIT_ORG_PER_HOUR, 300),
  }
}

export function createDbAiGuardDeps(db: DbClient): AiGuardDeps {
  return {
    assertQuota: (organizationId) => assertWithinLimit(db, organizationId, 'ai_messages', 1),
    consumeRateLimit: async (scope, subjectId, limit) => {
      const { data, error } = await db
        .rpc('consume_ai_rate_limit', {
          p_scope: scope,
          p_subject_id: subjectId,
          p_limit: limit,
          p_window_seconds: 3600,
        })
        .maybeSingle()
      if (error || !data) throw new Error('ai_rate_limit_unavailable: ' + (error?.message ?? 'no_row'))
      const row = data as unknown as { allowed: boolean; hits: number; reset_at: string }
      return { allowed: Boolean(row.allowed), hits: Number(row.hits), resetAt: new Date(row.reset_at) }
    },
    recordUsage: async (organizationId, route, tokens) => {
      await recordMeterUsage(db, organizationId, 'ai_messages', 1)
      if (tokens > 0) {
        await db.from('usage_ledger').insert({
          organization_id: organizationId,
          event_type: 'ai_tokens',
          units: tokens,
          reference_type: 'ai_route',
          metadata: { route },
        })
      }
    },
    now: () => new Date(),
  }
}

function retryAfter(resetAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
}

export async function checkAiGuard(ctx: AiGuardContext, deps: AiGuardDeps): Promise<AiGuardResult> {
  try {
    await deps.assertQuota(ctx.organizationId)
  } catch (error) {
    if (error instanceof EntitlementExceededError || (error as { code?: string })?.code === 'entitlement_exceeded') {
      return { ok: false, status: 429, code: 'ai_quota_exceeded', message: AI_GUARD_MESSAGES.quota }
    }
    console.error('ai_guard_quota_unavailable', { route: ctx.route, error: error instanceof Error ? error.message : error })
    return { ok: false, status: 503, code: 'ai_guard_unavailable', message: AI_GUARD_MESSAGES.unavailable }
  }

  const limits = aiRateLimits()
  try {
    const user = await deps.consumeRateLimit('user', ctx.userId, limits.perUserPerHour)
    if (!user.allowed) {
      return { ok: false, status: 429, code: 'ai_rate_limited', message: AI_GUARD_MESSAGES.userRate, retryAfterSeconds: retryAfter(user.resetAt, deps.now()) }
    }
    const org = await deps.consumeRateLimit('organization', ctx.organizationId, limits.perOrganizationPerHour)
    if (!org.allowed) {
      return { ok: false, status: 429, code: 'ai_rate_limited', message: AI_GUARD_MESSAGES.orgRate, retryAfterSeconds: retryAfter(org.resetAt, deps.now()) }
    }
  } catch (error) {
    console.error('ai_guard_rate_limit_unavailable', { route: ctx.route, error: error instanceof Error ? error.message : error })
    return { ok: false, status: 503, code: 'ai_guard_unavailable', message: AI_GUARD_MESSAGES.unavailable }
  }

  return { ok: true }
}

export function aiGuardResponse(rejection: AiGuardRejection): NextResponse {
  const headers: Record<string, string> = {}
  if (rejection.retryAfterSeconds) headers['Retry-After'] = String(rejection.retryAfterSeconds)
  return NextResponse.json({ error: rejection.code, message: rejection.message }, { status: rejection.status, headers })
}

/** Best-effort usage recording after a successful model call; never fails the response. */
export async function recordAiGuardUsage(deps: AiGuardDeps, ctx: AiGuardContext, tokens = 0): Promise<void> {
  try {
    await deps.recordUsage(ctx.organizationId, ctx.route, Math.max(0, Math.round(tokens)))
  } catch (error) {
    console.error('ai_guard_usage_record_failed', { route: ctx.route, error: error instanceof Error ? error.message : error })
  }
}

type GuardFactory = () => AiGuardDeps | Promise<AiGuardDeps>

let depsFactoryOverride: GuardFactory | null = null

/** Test seam: route handlers resolve their guard dependencies through here. */
export function setAiGuardDepsFactory(factory: GuardFactory | null) {
  depsFactoryOverride = factory
}

export async function resolveAiGuardDeps(): Promise<AiGuardDeps> {
  if (depsFactoryOverride) return depsFactoryOverride()
  const { createAdminClient } = await import('@/lib/db/admin')
  return createDbAiGuardDeps(createAdminClient())
}

/** Guard + 429 response in one call for route handlers. Returns null when allowed. */
export async function enforceAiGuard(ctx: AiGuardContext): Promise<{ response: NextResponse | null; deps: AiGuardDeps | null }> {
  let deps: AiGuardDeps
  try {
    deps = await resolveAiGuardDeps()
  } catch (error) {
    console.error('ai_guard_init_failed', error instanceof Error ? error.message : error)
    return { response: aiGuardResponse({ ok: false, status: 503, code: 'ai_guard_unavailable', message: AI_GUARD_MESSAGES.unavailable }), deps: null }
  }
  const verdict = await checkAiGuard(ctx, deps)
  if (!verdict.ok) {
    console.warn('ai_guard_rejected', { route: ctx.route, organizationId: ctx.organizationId, code: verdict.code })
    return { response: aiGuardResponse(verdict), deps }
  }
  return { response: null, deps }
}

/**
 * Server-action variant: returns the Arabic rejection message, or null when the call may
 * proceed (usage is counted immediately in that case).
 */
export async function guardAiAction(ctx: AiGuardContext): Promise<string | null> {
  const guard = await enforceAiGuard(ctx)
  if (guard.response) {
    const body = (await guard.response.clone().json().catch(() => null)) as { message?: string } | null
    return body?.message ?? AI_GUARD_MESSAGES.unavailable
  }
  if (guard.deps) await recordAiGuardUsage(guard.deps, ctx)
  return null
}
