'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
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
    const ctx = await requireCapability('appointments')

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

    const { error } = await ctx.db
      .from('appointments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: dbActionError(error) }

    await audit(ctx, 'appointment.status_changed', 'appointment', appointmentId, {
      from: current.status,
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
    const ctx = await requireCapability('appointments')
    const { error } = await ctx.db.from('appointments').insert({
      organization_id: ctx.organizationId,
      contact_id: input.contactId,
      service_id: input.serviceId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: 'confirmed',
    })
    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/dashboard/appointments')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) }
  }
}
