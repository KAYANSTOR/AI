import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

export type FollowUpState = {
  enrollmentId: string
  sequenceId: string
  currentStepId: string | null
  nextSendAt: string | null
  status: string
  channel: string | null
  templateContent: string | null
}

export async function getNextFollowUpStep(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string
): Promise<FollowUpState | null> {
  const { data: enrollment, error } = await supabase
    .from('followup_enrollments')
    .select('id, sequence_id, current_step_id, next_send_at, status')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .order('next_send_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!enrollment) return null

  const { data: steps } = await supabase
    .from('followup_steps')
    .select('id, channel, template_content, delay_minutes, step_order')
    .eq('sequence_id', enrollment.sequence_id)
    .order('step_order', { ascending: true })

  const nextStep = steps?.find((step) => step.id === enrollment.current_step_id) ?? steps?.[0] ?? null

  return {
    enrollmentId: enrollment.id,
    sequenceId: enrollment.sequence_id,
    currentStepId: enrollment.current_step_id,
    nextSendAt: enrollment.next_send_at,
    status: enrollment.status,
    channel: nextStep?.channel ?? null,
    templateContent: nextStep?.template_content ?? null,
  }
}

export async function markFollowUpAsSent(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  enrollmentId: string
): Promise<void> {
  const { error } = await supabase
    .from('followup_enrollments')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', enrollmentId)

  if (error) throw error
}
