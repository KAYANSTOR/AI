'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
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

    const { data: current, error: readError } = await ctx.supabase
      .from('appointments')
      .select('id, status, contact_id, starts_at')
      .eq('id', appointmentId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: supabaseActionError(readError) }
    if (!current) return { ok: false, error: 'الموعد غير موجود.' }

    if (!VALID[current.status]?.includes(nextStatus)) {
      return { ok: false, error: `انتقال غير مسموح: ${current.status} → ${nextStatus}` }
    }

    const { error } = await ctx.supabase
      .from('appointments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'appointment.status_changed', 'appointment', appointmentId, {
      from: current.status,
      to: nextStatus,
    })

    if (nextStatus === 'no_show' || nextStatus === 'cancelled') {
      try {
        await dispatchWorkflowTrigger(ctx.supabase, {
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
