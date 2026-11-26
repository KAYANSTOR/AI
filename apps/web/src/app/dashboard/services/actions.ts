'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'

export type SimpleResult = { ok: true } | { ok: false; error: string }

export async function createServiceAction(input: {
  name: string
  category?: string
  description: string
  duration_minutes: number
  price_amount: number | null
  price_currency: string
}): Promise<SimpleResult> {
  try {
    const ctx = await requireAdminCapability('appointments')
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const duration = input.duration_minutes
    const price = input.price_amount
    const currency = typeof input.price_currency === 'string' ? input.price_currency.trim().toUpperCase() : ''
    if (!name || name.length > 255) return { ok: false, error: 'أدخل اسم خدمة صحيحًا.' }
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) return { ok: false, error: 'مدة الخدمة يجب أن تكون بين 5 و1440 دقيقة.' }
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 99999999.99)) return { ok: false, error: 'أدخل سعرًا صحيحًا.' }
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'رمز العملة غير صحيح.' }
    if (input.category !== undefined && (typeof input.category !== 'string' || input.category.length > 80)) return { ok: false, error: 'فئة الخدمة غير صحيحة.' }
    if (typeof input.description !== 'string' || input.description.length > 4000) return { ok: false, error: 'وصف الخدمة غير صحيح أو طويل جدًا.' }
    const { error } = await ctx.db.from('services').insert({
      organization_id: ctx.organizationId,
      name,
      category: input.category?.trim() || null,
      description: input.description.trim() || null,
      duration_minutes: duration,
      price_amount: price,
      price_currency: currency,
      is_active: true,
    })
    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/dashboard/services')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ الخدمة.') }
  }
}

export async function deleteServiceAction(id: string): Promise<SimpleResult> {
  try {
    const ctx = await requireAdminCapability('appointments')
    const { data, error } = await ctx.db.from('services').delete()
      .eq('id', id).eq('organization_id', ctx.organizationId).select('id').maybeSingle()
    if (error) return { ok: false, error: dbActionError(error) }
    if (!data) return { ok: false, error: 'الخدمة غير موجودة أو لا تملك صلاحية حذفها.' }
    revalidatePath('/dashboard/services')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حذف الخدمة.') }
  }
}
