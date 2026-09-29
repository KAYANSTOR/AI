import type { SupabaseClient } from '@supabase/supabase-js'
import { startWorkflowRun } from '@/lib/workflows/engine'

export type DomainTrigger =
  | 'lead.created'
  | 'lead.won'
  | 'lead.lost'
  | 'appointment.created'
  | 'appointment.no_show'
  | 'appointment.cancelled'
  | 'quote.accepted'
  | 'order.completed'
  | 'conversation.handoff'

/**
 * Starts all published workflows matching the trigger for the tenant.
 * Failures are isolated per workflow so one broken definition does not block others.
 */
export async function dispatchWorkflowTrigger(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    triggerType: DomainTrigger | string
    payload: Record<string, unknown>
    idempotencyPrefix?: string
  }
): Promise<{ started: number; failed: number }> {
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('status', 'published')
    .eq('trigger_type', input.triggerType)

  if (error) throw error

  let started = 0
  let failed = 0

  for (const wf of workflows ?? []) {
    const key = input.idempotencyPrefix
      ? `${input.idempotencyPrefix}:${wf.id}`
      : undefined
    try {
      await startWorkflowRun(supabase, {
        organizationId: input.organizationId,
        workflowId: wf.id,
        triggerPayload: input.payload,
        context: input.payload,
        idempotencyKey: key,
      })
      started++
    } catch {
      failed++
    }
  }

  return { started, failed }
}
