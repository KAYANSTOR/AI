'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { setCapabilityEnabled } from '@/lib/capabilities/profile'
import { ar } from '@/lib/i18n/ar'

export async function toggleCapabilityAction(capabilityId: string, enabled: boolean) {
  const org = await getCurrentOrg()
  if (!org) throw new Error('غير مصرح.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية إدارة القدرات متاحة للمالك أو المسؤول فقط.')
  }
  const supabase = await createClient()
  try {
    await setCapabilityEnabled(supabase, org.organizationId, capabilityId, enabled)
  } catch (error) {
    console.error('Unable to update organization capability', error)
    throw new Error(ar.errors.save)
  }
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
}
