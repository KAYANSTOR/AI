'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { ar } from '@/lib/i18n/ar'

export type HoursResult = { ok: boolean; error?: string; message?: string }

export type DayInput = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
function normalizeTime(value: string): string {
  return TIME_PATTERN.test(value) ? value : value.slice(0, 5)
}

function validateDay(day: DayInput): string | null {
  if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
    return 'يوم غير صالح.'
  }
  if (day.isClosed) return null
  if (!TIME_PATTERN.test(normalizeTime(day.openTime))) {
    return `وقت الفتح غير صالح في ${ar.hours.weekdays[day.dayOfWeek]}.`
  }
  if (!TIME_PATTERN.test(normalizeTime(day.closeTime))) {
    return `وقت الإغلاق غير صالح في ${ar.hours.weekdays[day.dayOfWeek]}.`
  }
  if (normalizeTime(day.closeTime) <= normalizeTime(day.openTime)) {
    return `وقت الإغلاق يجب أن يكون بعد وقت الفتح في ${ar.hours.weekdays[day.dayOfWeek]}.`
  }
  return null
}

/** Saves the whole week in one transaction-like pass so availability can never see a half-week. */
export async function saveWeeklyHoursAction(days: DayInput[]): Promise<HoursResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (!Array.isArray(days) || days.length === 0) return { ok: false, error: 'لا توجد بيانات لحفظها.' }

  const seen = new Set<number>()
  for (const day of days) {
    const problem = validateDay(day)
    if (problem) return { ok: false, error: problem }
    if (seen.has(day.dayOfWeek)) return { ok: false, error: 'تكرار في أيام الأسبوع.' }
    seen.add(day.dayOfWeek)
  }

  const payload = days.map((day) => ({
    organization_id: ctx.organizationId,
    day_of_week: day.dayOfWeek,
    open_time: day.isClosed ? '00:00:00' : `${normalizeTime(day.openTime)}:00`,
    close_time: day.isClosed ? '00:00:00' : `${normalizeTime(day.closeTime)}:00`,
    is_closed: day.isClosed,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await ctx.supabase
    .from('business_hours')
    .upsert(payload, { onConflict: 'organization_id,day_of_week' })

  if (error) return { ok: false, error: supabaseActionError(error) }

  await audit(ctx, 'business_hours.updated', 'business_hours', null, {
    closed_days: payload.filter((row) => row.is_closed).map((row) => row.day_of_week),
  })

  revalidatePath('/dashboard/hours')
  return { ok: true, message: 'تم حفظ ساعات العمل، وسيستخدمها الوكيل في تقرير التوفر.' }
}

export type ExceptionInput = {
  exceptionDate: string
  isClosed: boolean
  openTime?: string | null
  closeTime?: string | null
  reason?: string | null
}

/** A holiday or a one-off opening change for a specific date. */
export async function saveExceptionAction(input: ExceptionInput): Promise<HoursResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (!DATE_PATTERN.test(input.exceptionDate)) return { ok: false, error: 'تاريخ غير صالح.' }

  let openTime: string | null = null
  let closeTime: string | null = null
  if (!input.isClosed) {
    const open = normalizeTime(String(input.openTime ?? ''))
    const close = normalizeTime(String(input.closeTime ?? ''))
    if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) {
      return { ok: false, error: 'أدخل وقت الفتح والإغلاق بصيغة 24 ساعة.' }
    }
    if (close <= open) return { ok: false, error: 'وقت الإغلاق يجب أن يكون بعد وقت الفتح.' }
    openTime = `${open}:00`
    closeTime = `${close}:00`
  }

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 255) : null

  // The organisation-wide row has a NULL location, which cannot be targeted by ON CONFLICT,
  // so replace it explicitly rather than relying on conflict inference.
  const { error: deleteError } = await ctx.supabase
    .from('business_hour_exceptions')
    .delete()
    .eq('organization_id', ctx.organizationId)
    .eq('exception_date', input.exceptionDate)
    .is('location_id', null)
  if (deleteError) return { ok: false, error: supabaseActionError(deleteError) }

  const { error } = await ctx.supabase.from('business_hour_exceptions').insert({
    organization_id: ctx.organizationId,
    location_id: null,
    exception_date: input.exceptionDate,
    is_closed: input.isClosed,
    open_time: openTime,
    close_time: closeTime,
    reason,
  })
  if (error) return { ok: false, error: supabaseActionError(error) }

  await audit(ctx, 'business_hours.exception_saved', 'business_hour_exception', null, {
    exception_date: input.exceptionDate,
    is_closed: input.isClosed,
  })

  revalidatePath('/dashboard/hours')
  return { ok: true, message: 'تم حفظ الاستثناء.' }
}

export async function deleteExceptionAction(id: string): Promise<HoursResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const { error } = await ctx.supabase
    .from('business_hour_exceptions')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
  if (error) return { ok: false, error: supabaseActionError(error, 'تعذّر حذف الاستثناء. حاول مرة أخرى.') }

  await audit(ctx, 'business_hours.exception_deleted', 'business_hour_exception', id)
  revalidatePath('/dashboard/hours')
  return { ok: true, message: 'تم حذف الاستثناء.' }
}
