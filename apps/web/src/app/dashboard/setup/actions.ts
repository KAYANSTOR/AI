'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { applyBusinessType } from '@/lib/capabilities/profile'
import { ar } from '@/lib/i18n/ar'

export async function saveBusinessSetup(formData: FormData) {
  const org = await getCurrentOrg()
  if (!org) throw new Error('غير مصرح.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية تغيير نوع النشاط متاحة للمالك أو المسؤول فقط.')
  }

  const businessTypeId = String(formData.get('business_type_id') ?? '').trim()
  if (!businessTypeId) throw new Error('اختر نوع النشاط.')

  const selected = formData.getAll('capability_id').map(String)
  const supabase = await createClient()

  try {
    await applyBusinessType(
      supabase,
      org.organizationId,
      businessTypeId,
      selected.length ? selected : undefined
    )
  } catch (error) {
    console.error('Unable to save business setup', error)
    throw new Error(ar.errors.save)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/settings')
}
