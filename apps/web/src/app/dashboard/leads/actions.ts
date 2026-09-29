'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { transitionLead, LeadTransitionError } from '@/lib/leads'

export type LeadActionResult = { ok: true } | { ok: false; error: string }

export async function updateLeadStatusAction(input: {
  leadId: string
  nextStatus: string
  nextAction?: string | null
  ownerMemberId?: string | null
}): Promise<LeadActionResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'Unauthorized' }
  if (org.role === 'read_only') return { ok: false, error: 'read_only role cannot update leads' }

  const supabase = await createClient()

  try {
    await transitionLead(supabase, {
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
    return { ok: false, error: error instanceof Error ? error.message : 'update failed' }
  }

  revalidatePath('/dashboard/leads')
  return { ok: true }
}
