'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { applyBusinessType } from '@/lib/capabilities/profile'

export async function saveBusinessSetup(formData: FormData) {
  const org = await getCurrentOrg()
  if (!org) throw new Error('Unauthorized')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('Only owners/admins can change business type')
  }

  const businessTypeId = String(formData.get('business_type_id') ?? '').trim()
  if (!businessTypeId) throw new Error('Business type is required')

  const selected = formData.getAll('capability_id').map(String)
  const supabase = await createClient()

  await applyBusinessType(
    supabase,
    org.organizationId,
    businessTypeId,
    selected.length ? selected : undefined
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/settings')
}
