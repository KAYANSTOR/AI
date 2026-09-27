'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { setCapabilityEnabled } from '@/lib/capabilities/profile'

export async function toggleCapabilityAction(capabilityId: string, enabled: boolean) {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('Only owners/admins can change capabilities')
  }
  const supabase = await createClient()
  await setCapabilityEnabled(supabase, org.organizationId, capabilityId, enabled)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
}
