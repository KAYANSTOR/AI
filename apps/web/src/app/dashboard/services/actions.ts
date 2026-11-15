'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'

export type SimpleResult = { ok: true } | { ok: false }

export async function createServiceAction(input: {
  name: string
  category?: string
  description: string
  duration_minutes: number
  price_amount: number | null
  price_currency: string
}): Promise<SimpleResult> {
  const org = await getCurrentOrg()
  if (!org || !input.name.trim()) return { ok: false }
  const name = input.name?.trim()
  const duration = Number(input.duration_minutes)
  const price = input.price_amount === null ? null : Number(input.price_amount)
  if (!name || name.length > 255) return { ok: false }
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) return { ok: false }
  if (price !== null && (!Number.isFinite(price) || price < 0)) return { ok: false }
  if (input.category && input.category.length > 80) return { ok: false }
  const db = await createClient()
  const { error } = await db.from('services').insert({
    organization_id: org.organizationId,
    name,
    category: input.category?.trim().slice(0, 80) || null,
    description: input.description.trim().slice(0, 4000) || null,
    duration_minutes: duration,
    price_amount: price,
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
