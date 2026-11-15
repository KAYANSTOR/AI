'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'

export type ReportActionResult = { ok: true; id?: string } | { ok: false; error: string }

const ALLOWED_TYPES = ['analytics', 'conversations', 'leads', 'orders', 'appointments'] as const

export async function createReportAction(input: {
  name: string
  reportType: string
  description?: string
  scheduleCron?: string | null
}): Promise<ReportActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    if (!ctx.businessId) {
      return { ok: false, error: 'أكمل إعداد النشاط أولاً قبل حفظ التقارير.' }
    }

    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: 'اسم التقرير مطلوب.' }

    const reportType = ALLOWED_TYPES.includes(input.reportType as (typeof ALLOWED_TYPES)[number])
      ? input.reportType
      : 'analytics'

    const { data, error } = await ctx.db
      .from('reports')
      .insert({
        business_id: ctx.businessId,
        name,
        description: input.description?.trim() || null,
        report_type: reportType,
        config: {},
        schedule_cron: input.scheduleCron?.trim() || null,
        is_active: true,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: dbActionError(error) }

    revalidatePath('/dashboard/reports')
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ التقرير.') }
  }
}

export async function toggleReportActiveAction(
  reportId: string,
  isActive: boolean
): Promise<ReportActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    if (!ctx.businessId) return { ok: false, error: 'لا يوجد نشاط مرتبط.' }

    const { error } = await ctx.db
      .from('reports')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', reportId)
      .eq('business_id', ctx.businessId)

    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/dashboard/reports')
    return { ok: true, id: reportId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث التقرير.') }
  }
}

export async function deleteReportAction(reportId: string): Promise<ReportActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    if (!ctx.businessId) return { ok: false, error: 'لا يوجد نشاط مرتبط.' }

    const { error } = await ctx.db
      .from('reports')
      .delete()
      .eq('id', reportId)
      .eq('business_id', ctx.businessId)

    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/dashboard/reports')
    return { ok: true, id: reportId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حذف التقرير.') }
  }
}
