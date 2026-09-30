'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/capabilities/guard'
import { evaluateSmokeTest } from '@/lib/onboarding/smoke-test'
import { activationStateForStep } from '@/lib/onboarding/activation'

/**
 * Moves the activation wizard to a step.
 *
 * The resulting activation state is derived here from the step being entered and the tenant's
 * *stored* smoke-test status. The caller deliberately cannot name its own state: taking it as
 * an argument let a client write `active` straight into business_profiles and skip the
 * server-gated Go Live in activateGoLive(), which is the only place allowed to activate a
 * tenant.
 */
export async function advanceStep(nextStep: number) {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()
  const step = Math.min(11, Math.max(1, Math.floor(nextStep)))

  const { data: profile, error: readError } = await supabase
    .from('business_profiles')
    .select('activation_state, smoke_test_status')
    .eq('organization_id', org.organizationId)
    .maybeSingle()

  if (readError) throw readError

  const nextState = activationStateForStep({
    step,
    storedState: String(profile?.activation_state ?? 'workspace_ready'),
    smokeStatus: (profile?.smoke_test_status as string | null) ?? null,
  })

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
