'use server'

import { revalidatePath } from 'next/cache'
import { requireBusinessDashboardWriter, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { validateAppointmentInput } from '@/lib/appointments/validate-input'
import { dispatchWorkflowTrigger } from '@/lib/workflows/triggers'

export type AppointmentResult = { ok: true } | { ok: false; error: string }

const VALID: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'completed', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: ['confirmed'],
}

export async function changeAppointmentStatusAction(
  appointmentId: string,
  nextStatus: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
): Promise<AppointmentResult> {
  try {
    const ctx = await requireBusinessDashboardWriter('appointments')

    const { data: current, error: readError } = await ctx.db
      .from('appointments')
      .select('id, status, contact_id, starts_at')
      .eq('id', appointmentId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: dbActionError(readError) }
    if (!current) return { ok: false, error: 'الموعد غير موجود.' }

    if (!VALID[current.status]?.includes(nextStatus)) {
      return { ok: false, error: `انتقال غير مسموح: ${current.status} → ${nextStatus}` }
    }

    const previousStatus = current.status
    const { data: updated, error } = await ctx.db
      .from('appointments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .eq('organization_id', ctx.organizationId)
      .eq('status', previousStatus)
      .select('id').maybeSingle()

    if (error) return { ok: false, error: dbActionError(error) }
    if (!updated) return { ok: false, error: 'تغيّرت حالة الموعد. حدّث الصفحة ثم حاول مرة أخرى.' }

    await audit(ctx, 'appointment.status_changed', 'appointment', appointmentId, {
      from: previousStatus,
      to: nextStatus,
    })

    if (nextStatus === 'no_show' || nextStatus === 'cancelled') {
      try {
        await dispatchWorkflowTrigger(ctx.db, {
          organizationId: ctx.organizationId,
          triggerType:
            nextStatus === 'no_show' ? 'appointment.no_show' : 'appointment.cancelled',
          payload: {
            appointmentId,
            contactId: current.contact_id,
            startsAt: current.starts_at,
          },
          idempotencyPrefix: `appt:${appointmentId}:${nextStatus}`,
        })
      } catch {
        // non-blocking
      }
    }

    revalidatePath('/dashboard/appointments')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث الموعد.') }
  }
}

export async function createAppointmentAction(input: {
  contactId: string
  serviceId: string
  startsAt: string
  endsAt: string
}): Promise<AppointmentResult> {
  try {
    const ctx = await requireBusinessDashboardWriter('appointments')
    const validated = await validateAppointmentInput(ctx.db, ctx.organizationId, input)
    if (!validated.ok) return validated
    const { error } = await ctx.db.from('appointments').insert({
      organization_id: ctx.organizationId,
      contact_id: input.contactId,
      service_id: input.serviceId,
      starts_at: validated.startsAt,
      ends_at: validated.endsAt,
      status: 'confirmed',
    })
    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/dashboard/appointments')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) }
  }
}
