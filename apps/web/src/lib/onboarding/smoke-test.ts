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

/**
 * The production readiness checks behind Go Live.
 *
 * This lives outside `'use server'` on purpose: every exported async function in a server-action
 * module becomes a callable endpoint, and this one takes a Supabase client and an organisation
 * id as arguments, which is not something a client may supply.
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
  const hasBusinessType = Boolean(profile?.business_type_id)
  const hasTimezone = Boolean(profile?.timezone)

  checks.push({
    name: 'business_profile',
    ok: hasProfile,
    message: hasProfile ? 'Business profile exists for this organization.' : 'Business profile is missing.',
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

  const { data: activeChannels } = await supabase
    .from('channels')
    .select('id')
    .eq('organization_id', org.organizationId)
    .eq('is_active', true)
    .limit(1)

  const hasChannel = (activeChannels ?? []).length > 0
  checks.push({
    name: 'active_channel',
    ok: hasChannel,
    message: hasChannel
      ? 'At least one active channel is configured.'
      : 'No active communication channel was found for this organization.',
  })

  const { data: activeAgents } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('organization_id', org.organizationId)
    .eq('status', 'active')
    .limit(1)

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
      ? 'Smoke test passed: organization setup, channel configuration, and active agent are all valid.'
      : `Smoke test failed: ${failedChecks.map((check) => check.name).join(', ')}.`,
    testedAt,
    checks,
  }
}
