'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/capabilities/guard'

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

export async function advanceStep(nextStep: number, nextState: string = 'configuring') {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()
  const step = Math.min(11, Math.max(1, Math.floor(nextStep)))

  const { error } = await supabase
    .from('business_profiles')
    .update({
      activation_step: step,
      activation_state: nextState,
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error
  revalidatePath('/onboarding')
  revalidatePath('/dashboard')
}

export async function submitSmokeTest() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()
  const outcome = await evaluateSmokeTest(supabase, org)

  const { error } = await supabase
    .from('business_profiles')
    .update({
      smoke_test_status: outcome.passed ? 'passed' : 'failed',
      smoke_test_result: outcome,
      activation_state: outcome.passed ? 'ready_to_activate' : 'configuring',
      activation_step: 10,
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error

  if (!outcome.passed) {
    throw new Error(outcome.summary)
  }

  await audit(
    { supabase, ...org, businessId: null } as unknown as Parameters<typeof audit>[0],
    'smoke_test.passed',
    'organization',
    org.organizationId
  )
  revalidatePath('/onboarding')
  revalidatePath('/dashboard')
}

/**
 * Go-live is server-gated: the stored smoke_test_status is not trusted alone.
 * We re-evaluate the same production checks so a stale "passed" flag cannot activate
 * a tenant that no longer has a channel or agent.
 */
export async function activateGoLive() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()
  const outcome = await evaluateSmokeTest(supabase, org)

  if (!outcome.passed) {
    await supabase
      .from('business_profiles')
      .update({
        smoke_test_status: 'failed',
        smoke_test_result: outcome,
        activation_state: 'configuring',
      })
      .eq('organization_id', org.organizationId)
    throw new Error(outcome.summary)
  }

  const { error } = await supabase
    .from('business_profiles')
    .update({
      activation_state: 'active',
      activation_step: 11,
      smoke_test_status: 'passed',
      smoke_test_result: outcome,
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error

  await audit(
    { supabase, ...org, businessId: null } as unknown as Parameters<typeof audit>[0],
    'tenant.activated',
    'organization',
    org.organizationId
  )

  revalidatePath('/dashboard')
  revalidatePath('/onboarding')
}
