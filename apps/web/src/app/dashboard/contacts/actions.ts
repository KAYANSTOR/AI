'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'

export type SimpleResult = { ok: true } | { ok: false }

export async function createContactAction(input: { full_name: string; phone: string; email: string }): Promise<SimpleResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false }
  const db = await createClient()
  const { error } = await db.from('contacts').insert({
    organization_id: org.organizationId,
    full_name: input.full_name.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
  })
  if (error) return { ok: false }
  revalidatePath('/dashboard/contacts')
  return { ok: true }
}
