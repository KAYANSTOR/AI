import type { createClient } from '@/lib/supabase/server'

export type SmokeTestCheck = {
  name: string
  ok: boolean
  message: string
}

export type SmokeTestOutcome = {
  passed: boolean
  status: 'passed' | 'failed'
  summary: string
  testedAt: string
  checks: SmokeTestCheck[]
}

export function withReplyTestCheck(
  outcome: SmokeTestOutcome,
  replyStatus: 'answered' | 'skipped' | 'failed'
): SmokeTestOutcome {
  const check: SmokeTestCheck = {
    name: 'reply_test',
    ok: replyStatus === 'answered',
    message:
      replyStatus === 'answered'
        ? 'تم اختبار رد المساعد بنجاح.'
        : replyStatus === 'skipped'
          ? 'تعذر التحقق من رد المساعد الآن. تحقق من إعداد مزود الذكاء الاصطناعي ثم أعد الاختبار.'
          : 'لم يكتمل رد المساعد التجريبي. راجع إعداد الوكيل ثم أعد الاختبار.',
  }
  const checks = [...outcome.checks, check]
  const failedChecks = checks.filter((item) => !item.ok)
  const passed = failedChecks.length === 0

  return {
    ...outcome,
    passed,
    status: passed ? 'passed' : 'failed',
    summary: passed
      ? 'Smoke test passed: organization setup, a verified channel, an active agent, and a real agent reply are all valid.'
      : `Smoke test failed: ${failedChecks.map((item) => item.name).join(', ')}.`,
    checks,
  }
}

/**
 * The production readiness checks behind Go Live.
 *
 * This lives outside `'use server'` on purpose: every exported async function in a server-action
 * module becomes a callable endpoint, and this one takes a Supabase client and an organisation
 * id as arguments, which is not something a client may supply.
 *
 * The channel rule follows the FastPath plan: a business may start with one intended channel,
 * but that channel must be verified. An enabled channel that never completed provider
 * verification is reported as its own missing step instead of being treated as ready.
 */
export async function evaluateSmokeTest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  org: { organizationId: string }
): Promise<SmokeTestOutcome> {
  const checks: SmokeTestCheck[] = []

  const { data: profile, error: profileError } = await supabase
    .from('business_profiles')
    .select('business_id, business_type_id, timezone, activation_state')
    .eq('organization_id', org.organizationId)
    .maybeSingle()

  if (profileError) throw profileError

  const hasProfile = Boolean(profile)
  const businessId = (profile?.business_id as string | null) ?? null
  const hasBusinessType = Boolean(profile?.business_type_id)
  const hasTimezone = Boolean(profile?.timezone)

  checks.push({
    name: 'business_profile',
    ok: hasProfile && Boolean(businessId),
    message:
      hasProfile && businessId
        ? 'Business profile exists for this organization.'
        : 'A business profile linked to a business is required.',
  })

  checks.push({
    name: 'business_type',
    ok: hasBusinessType,
    message: hasBusinessType ? 'Business type has been selected.' : 'Business type must be selected before activation.',
  })

  checks.push({
    name: 'timezone',
    ok: hasTimezone,
    message: hasTimezone ? 'Timezone is configured.' : 'Timezone must be configured before activation.',
  })

  const { data: channels, error: channelsError } = businessId
    ? await supabase
        .from('channels')
        .select('id, is_active, verification_status')
        .eq('organization_id', org.organizationId)
        .eq('business_id', businessId)
    : { data: [], error: null }
  if (channelsError) throw channelsError

  const rows = (channels ?? []) as { id: string; is_active: boolean | null; verification_status: string | null }[]
  const hasChannel = rows.some((row) => row.is_active === true)
  checks.push({
    name: 'active_channel',
    ok: hasChannel,
    message: hasChannel
      ? 'At least one active channel is configured.'
      : 'No active communication channel was found for this organization.',
  })

  const hasVerifiedChannel = rows.some(
    (row) => row.is_active === true && row.verification_status === 'verified'
  )
  checks.push({
    name: 'verified_channel',
    ok: hasVerifiedChannel,
    message: hasVerifiedChannel
      ? 'The active channel passed provider verification.'
      : 'No active channel has completed verification yet; finish the connection or retry it.',
  })

  const { data: activeAgents, error: agentsError } = businessId
    ? await supabase
        .from('ai_agents')
        .select('id')
        .eq('organization_id', org.organizationId)
        .eq('business_id', businessId)
        .eq('status', 'active')
        .limit(1)
    : { data: [], error: null }
  if (agentsError) throw agentsError

  const hasActiveAgent = (activeAgents ?? []).length > 0
  checks.push({
    name: 'active_agent',
    ok: hasActiveAgent,
    message: hasActiveAgent
      ? 'An active AI agent exists.'
      : 'An active AI agent is required before go-live.',
  })

  const failedChecks = checks.filter((check) => !check.ok)
  const passed = failedChecks.length === 0
  const testedAt = new Date().toISOString()

  return {
    passed,
    status: passed ? 'passed' : 'failed',
    summary: passed
      ? 'Smoke test passed: organization setup, a verified channel, and an active agent are all valid.'
      : `Smoke test failed: ${failedChecks.map((check) => check.name).join(', ')}.`,
    testedAt,
    checks,
  }
}
