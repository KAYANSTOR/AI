'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type LocationResult = { ok: boolean; error?: string; message?: string; locationId?: string }

export type LocationInput = {
  id?: string | null
  name: string
  address?: string | null
  phone?: string | null
  timezone?: string | null
  isActive?: boolean
}

/**
 * Locations hang off the business, which is what the channels and the runtime resolve
 * against, so a location cannot exist before the business does.
 */
async function requireBusiness(ctx: AuthorizedContext): Promise<string | LocationResult> {
  if (ctx.businessId) return ctx.businessId
  return { ok: false, error: 'أكمل إعداد النشاط أولًا، لأن الفروع تُربط بالنشاط.' }
}

export async function saveLocationAction(input: LocationInput): Promise<LocationResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const businessId = await requireBusiness(ctx)
  if (typeof businessId !== 'string') return businessId

  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'اسم الفرع مطلوب.' }

  const payload = {
    business_id: businessId,
    name: name.slice(0, 255),
    address: input.address?.trim() ? input.address.trim() : null,
    timezone: input.timezone?.trim() ? input.timezone.trim().slice(0, 100) : null,
    // The location's contact number is stored with the business record's metadata-free
    // columns, so it is kept in `metadata` rather than invented as a new column.
    metadata: input.phone?.trim() ? { phone: input.phone.trim().slice(0, 50) } : {},
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await ctx.supabase
      .from('business_locations')
      .update(payload)
      .eq('id', input.id)
      .eq('business_id', businessId)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: supabaseActionError(error) }
    if (!data) return { ok: false, error: 'لم يتم العثور على الفرع.' }
    await audit(ctx, 'location.updated', 'business_location', data.id, { name })
    revalidatePath('/dashboard/locations')
    return { ok: true, message: 'تم تحديث الفرع.', locationId: data.id }
  }

  const { data, error } = await ctx.supabase
    .from('business_locations')
    .insert(payload)
    .select('id')
    .single()
  if (error) return { ok: false, error: supabaseActionError(error) }

  await audit(ctx, 'location.created', 'business_location', data.id, { name })
  revalidatePath('/dashboard/locations')
  return { ok: true, message: 'تمت إضافة الفرع.', locationId: data.id }
}

/**
 * Deactivates rather than deletes: an archived location is referenced by channels and by
 * historical appointments, so removing the row would break that history.
 */
export async function setLocationActiveAction(id: string, isActive: boolean): Promise<LocationResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (!ctx.businessId) return { ok: false, error: 'أكمل إعداد النشاط أولًا.' }

  const { data, error } = await ctx.supabase
    .from('business_locations')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', ctx.businessId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: supabaseActionError(error) }
  if (!data) return { ok: false, error: 'لم يتم العثور على الفرع.' }

  await audit(ctx, isActive ? 'location.activated' : 'location.deactivated', 'business_location', id)
  revalidatePath('/dashboard/locations')
  return { ok: true, message: isActive ? 'تم تفعيل الفرع.' : 'تم تعطيل الفرع.' }
}
