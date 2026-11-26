'use server'

import { revalidatePath } from 'next/cache'
import { requireBusinessDashboardCapability } from '@/lib/capabilities/guard'

export type SimpleResult = { ok: true } | { ok: false }

export async function createContactAction(input: { full_name: string; phone: string; email: string }): Promise<SimpleResult> {
  try {
  const org = await requireBusinessDashboardCapability('lead_capture')
  if (org.role !== 'owner' && org.role !== 'admin') return { ok: false }
  const db = org.db
  const { error } = await db.from('contacts').insert({
    organization_id: org.organizationId,
    full_name: input.full_name.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
  })
  if (error) return { ok: false }
  revalidatePath('/dashboard/contacts')
  return { ok: true }
  } catch {
    return { ok: false }
  }
}
