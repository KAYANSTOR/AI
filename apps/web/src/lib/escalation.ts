import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

export type EscalationTrigger = 'sla_breach' | 'sla_warning' | 'handoff' | 'high_priority'

/**
 * Notifies members whose role matches active escalation policies for the trigger.
 * Idempotent per (conversation, policy, trigger) via notification keys.
 */
export async function runEscalationPolicies(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    conversationId: string
    trigger: EscalationTrigger
    assigneeMemberId?: string | null
  }
): Promise<{ notified: number }> {
  const { data: policies } = await supabase
    .from('escalation_policies')
    .select('id, name, notify_roles, escalate_after_minutes')
    .eq('organization_id', input.organizationId)
    .eq('trigger_type', input.trigger)
    .eq('is_active', true)

  if (!policies?.length) {
    // Fallback: single org-wide notification when no policies defined yet
    if (input.trigger === 'sla_breach' || input.trigger === 'sla_warning') {
      await createNotification(supabase, {
        organizationId: input.organizationId,
        memberId: input.assigneeMemberId ?? null,
        entityType: 'conversation',
        entityId: input.conversationId,
        notificationType: 'high_priority',
        title: input.trigger === 'sla_breach' ? 'تجاوز SLA' : 'تحذير SLA',
        body:
          input.trigger === 'sla_breach'
            ? 'محادثة تجاوزت مهلة الاستجابة أو الحل.'
            : 'محادثة اقتربت من تجاوز مهلة SLA.',
        idempotencyKey: `sla-default:${input.trigger}:${input.conversationId}`,
      })
      return { notified: 1 }
    }
    return { notified: 0 }
  }

  let notified = 0

  for (const policy of policies) {
    const roles = (policy.notify_roles as string[]) ?? ['admin', 'manager']

    const { data: members } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', input.organizationId)
      .eq('is_active', true)
      .in('role', roles)

    const targets = members ?? []
    if (!targets.length) {
      await createNotification(supabase, {
        organizationId: input.organizationId,
        memberId: null,
        entityType: 'conversation',
        entityId: input.conversationId,
        notificationType: 'high_priority',
        title: policy.name,
        body: `تصعيد (${input.trigger}) للمحادثة.`,
        idempotencyKey: `esc:${policy.id}:${input.trigger}:${input.conversationId}:org`,
      })
      notified++
      continue
    }

    for (const m of targets) {
      await createNotification(supabase, {
        organizationId: input.organizationId,
        memberId: m.id,
        entityType: 'conversation',
        entityId: input.conversationId,
        notificationType: 'high_priority',
        title: policy.name,
        body: `تصعيد (${input.trigger}) — راجع المحادثة.`,
        idempotencyKey: `esc:${policy.id}:${input.trigger}:${input.conversationId}:${m.id}`,
      })
      notified++
    }
  }

  await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    actor_type: 'system',
    action: 'escalation.triggered',
    entity_type: 'conversation',
    entity_id: input.conversationId,
    metadata: { trigger: input.trigger, notified },
  })

  return { notified }
}
