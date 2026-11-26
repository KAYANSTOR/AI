import type { createClient } from '@/lib/db/server'
import { selectBusinessAgent } from '@/lib/runtime/business-agent'
import { isOnboardingChannelReady } from '@/lib/channels/connect'
import { loadOnboardingChannels } from './channel-readiness'

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
  const checks = [...outcome.checks.filter((item) => item.name !== 'reply_test'), check]
  const failedChecks = checks.filter((item) => !item.ok)
  const passed = failedChecks.length === 0

  return {
    ...outcome,
    passed,
    status: passed ? 'passed' : 'failed',
    summary: passed
      ? 'Smoke test passed: organization setup, a saved channel, an active agent, and a real agent reply are all valid.'
      : `Smoke test failed: ${failedChecks.map((item) => item.name).join(', ')}.`,
    checks,
  }
}

/**
 * Production readiness checks behind Go Live.
 * Require a verified active messaging channel scoped to the same business as its agent.
 */
export async function evaluateSmokeTest(
  db: Awaited<ReturnType<typeof createClient>>,
  org: { organizationId: string }
): Promise<SmokeTestOutcome> {
  const checks: SmokeTestCheck[] = []

  const { data: profile, error: profileError } = await db
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

  const scoped = businessId ? await loadOnboardingChannels(db, org.organizationId, businessId) : []
  const hasChannel = scoped.some((row) => row.is_active === true)
  checks.push({
    name: 'active_channel',
    ok: hasChannel,
    message: hasChannel
      ? 'At least one active channel is configured.'
      : 'No active communication channel was found for this organization.',
  })

  const hasVerifiedChannel = scoped.some(isOnboardingChannelReady)
  checks.push({
    name: 'verified_channel',
    ok: hasVerifiedChannel,
    message: hasVerifiedChannel
      ? 'At least one messaging channel is active and verified.'
      : 'Complete the connection and verification of a messaging channel, then retry.',
  })

  const activeAgent = businessId ? await selectBusinessAgent(db, org.organizationId, businessId) : null
  const hasActiveAgent = Boolean(activeAgent)
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
      ? 'Smoke test passed: organization setup, a saved channel, and an active agent are all valid.'
      : `Smoke test failed: ${failedChecks.map((check) => check.name).join(', ')}.`,
    testedAt,
    checks,
  }
}
