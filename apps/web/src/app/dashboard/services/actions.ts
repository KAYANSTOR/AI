'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'

export type SimpleResult = { ok: true } | { ok: false }

export async function createServiceAction(input: {
  name: string
  description: string
  duration_minutes: number
  price_amount: number | null
  price_currency: string
}): Promise<SimpleResult> {
  const org = await getCurrentOrg()
  if (!org || !input.name.trim()) return { ok: false }
  const db = await createClient()
  const { error } = await db.from('services').insert({
    organization_id: org.organizationId,
    name: input.name.trim(),
    description: input.description.trim() || null,
    duration_minutes: Number(input.duration_minutes),
    price_amount: input.price_amount,
    price_currency: input.price_currency,
    is_active: true,
  })
  if (error) return { ok: false }
  revalidatePath('/dashboard/services')
  return { ok: true }
}

export async function deleteServiceAction(id: string): Promise<SimpleResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false }
  const db = await createClient()
  const { error } = await db.from('services').delete().eq('id', id).eq('organization_id', org.organizationId)
  if (error) return { ok: false }
  revalidatePath('/dashboard/services')
  return { ok: true }
}
