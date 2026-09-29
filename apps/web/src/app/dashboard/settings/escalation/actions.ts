'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type EscalationResult = { ok: true; id?: string } | { ok: false; error: string }

const TRIGGERS = new Set(['sla_breach', 'sla_warning', 'handoff', 'high_priority'])

export async function createEscalationPolicyAction(input: {
  name: string
  triggerType: string
  escalateAfterMinutes?: number
  notifyRoles?: string[]
}): Promise<EscalationResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'الاسم مطلوب.' }
    if (!TRIGGERS.has(input.triggerType)) return { ok: false, error: 'نوع محفّز غير صالح.' }

    const { data, error } = await ctx.supabase
      .from('escalation_policies')
      .insert({
        organization_id: ctx.organizationId,
        name,
        trigger_type: input.triggerType,
        escalate_after_minutes: Math.max(1, input.escalateAfterMinutes ?? 15),
        notify_roles: input.notifyRoles?.length ? input.notifyRoles : ['admin', 'manager'],
        is_active: true,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'escalation_policy.created', 'escalation_policy', data.id)
    revalidatePath('/dashboard/settings/escalation')
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحفظ.') }
  }
}

export async function setEscalationPolicyActiveAction(
  id: string,
  active: boolean
): Promise<EscalationResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const { error } = await ctx.supabase
      .from('escalation_policies')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, active ? 'escalation_policy.enabled' : 'escalation_policy.disabled', 'escalation_policy', id)
    revalidatePath('/dashboard/settings/escalation')
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر التحديث.') }
  }
}
