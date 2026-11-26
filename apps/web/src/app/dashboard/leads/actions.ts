'use server'

import { revalidatePath } from 'next/cache'
import { requireBusinessDashboardCapability } from '@/lib/capabilities/guard'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import { transitionLead, LeadTransitionError } from '@/lib/leads'

export type LeadActionResult = { ok: true } | { ok: false; error: string }

export async function updateLeadStatusAction(input: {
  leadId: string
  nextStatus: string
  nextAction?: string | null
  ownerMemberId?: string | null
}): Promise<LeadActionResult> {
  try {
    const org = await requireBusinessDashboardCapability('lead_capture')
    if (org.role === 'read_only') return { ok: false, error: 'ليس لديك صلاحية تعديل الفرص.' }
    const db = org.db
    await transitionLead(db, {
      organizationId: org.organizationId,
      leadId: input.leadId,
      nextStatus: input.nextStatus,
      actorUserId: org.userId,
      nextAction: input.nextAction,
      ownerMemberId: input.ownerMemberId,
    })
  } catch (error) {
    if (error instanceof LeadTransitionError) {
      return { ok: false, error: error.message }
    }
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث الفرصة.') }
  }

  revalidatePath('/dashboard/leads')
  return { ok: true }
}
