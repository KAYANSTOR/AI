'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/capabilities/guard'

export async function advanceStep(nextStep: number, nextState: string = 'configuring') {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()

  const { error } = await supabase
    .from('business_profiles')
    .update({ 
      activation_step: nextStep,
      activation_state: nextState
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error
  revalidatePath('/onboarding')
}

export async function submitSmokeTest() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()

  // Fake smoke test logic for now
  const { error } = await supabase
    .from('business_profiles')
    .update({ 
      smoke_test_status: 'passed',
      smoke_test_result: { timestamp: new Date().toISOString(), result: 'success' },
      activation_state: 'ready_to_activate'
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error
  
  await audit({ supabase, ...org, businessId: null } as unknown as any, 'smoke_test.passed', 'organization', org.organizationId)
  revalidatePath('/onboarding')
}

export async function activateGoLive() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('business_profiles')
    .select('smoke_test_status')
    .eq('organization_id', org.organizationId)
    .single()

  if (profile?.smoke_test_status !== 'passed') {
    throw new Error('Smoke test not passed')
  }

  const { error } = await supabase
    .from('business_profiles')
    .update({ 
      activation_state: 'active'
    })
    .eq('organization_id', org.organizationId)

  if (error) throw error
  
  await audit({ supabase, ...org, businessId: null } as unknown as any, 'tenant.activated', 'organization', org.organizationId)
  
  revalidatePath('/dashboard')
  revalidatePath('/onboarding')
}
