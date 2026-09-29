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

export type FollowUpAdvanceResult =
  | { status: 'skipped'; reason: string }
  | {
      status: 'ready'
      enrollmentId: string
      sequenceId: string
      stepId: string
      channel: string
      templateContent: string
      contactId: string
      organizationId: string
    }
  | { status: 'completed'; enrollmentId: string }

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

  const nextStep =
    steps?.find((step) => step.id === enrollment.current_step_id) ?? steps?.[0] ?? null

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

/**
 * Claims a due enrollment for sending. Conditional update prevents two workers
 * from delivering the same step (duplicate prevention).
 */
export async function claimDueEnrollment(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
  organizationId: string
): Promise<FollowUpAdvanceResult> {
  const now = new Date().toISOString()

  const { data: claimed, error: claimError } = await supabase
    .from('followup_enrollments')
    .update({
      status: 'sending',
      last_attempt_at: now,
      attempt_count: 1,
      updated_at: now,
    })
    .eq('id', enrollmentId)
    .eq('organization_id', organizationId)
    .eq('status', 'scheduled')
    .lte('next_send_at', now)
    .select('id, sequence_id, current_step_id, contact_id, organization_id, attempt_count')
    .maybeSingle()

  if (claimError) throw claimError
  if (!claimed) return { status: 'skipped', reason: 'not_claimable' }

  // Re-read attempt_count correctly: bump via RPC-less pattern
  await supabase
    .from('followup_enrollments')
    .update({
      attempt_count: Number(claimed.attempt_count ?? 0) + 1,
    })
    .eq('id', claimed.id)
    .eq('organization_id', organizationId)

  const { data: steps, error: stepsError } = await supabase
    .from('followup_steps')
    .select('id, channel, template_content, delay_minutes, step_order')
    .eq('sequence_id', claimed.sequence_id)
    .order('step_order', { ascending: true })

  if (stepsError) throw stepsError

  const ordered = steps ?? []
  const current =
    ordered.find((s) => s.id === claimed.current_step_id) ?? ordered[0] ?? null

  if (!current) {
    await supabase
      .from('followup_enrollments')
      .update({
        status: 'completed',
        exit_reason: 'no_steps',
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
      .eq('organization_id', organizationId)
    return { status: 'completed', enrollmentId: claimed.id }
  }

  return {
    status: 'ready',
    enrollmentId: claimed.id,
    sequenceId: claimed.sequence_id,
    stepId: current.id,
    channel: String(current.channel),
    templateContent: String(current.template_content),
    contactId: claimed.contact_id,
    organizationId: claimed.organization_id,
  }
}

/**
 * After a successful send, advance to the next step or complete the enrollment.
 * Idempotent relative to status: only rows in `sending` move forward.
 */
export async function completeFollowUpStep(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  args: {
    organizationId: string
    enrollmentId: string
    sequenceId: string
    completedStepId: string
  }
): Promise<{ status: 'advanced' | 'completed'; nextSendAt: string | null }> {
  const { data: steps, error } = await supabase
    .from('followup_steps')
    .select('id, delay_minutes, step_order')
    .eq('sequence_id', args.sequenceId)
    .order('step_order', { ascending: true })

  if (error) throw error

  const ordered = steps ?? []
  const idx = ordered.findIndex((s) => s.id === args.completedStepId)
  const next = idx >= 0 ? ordered[idx + 1] : null
  const now = new Date()

  if (!next) {
    const { error: doneError } = await supabase
      .from('followup_enrollments')
      .update({
        status: 'completed',
        exit_reason: 'sequence_finished',
        current_step_id: args.completedStepId,
        next_send_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', args.enrollmentId)
      .eq('organization_id', args.organizationId)
      .eq('status', 'sending')

    if (doneError) throw doneError
    return { status: 'completed', nextSendAt: null }
  }

  const delayMs = Math.max(0, Number(next.delay_minutes ?? 0)) * 60_000
  const nextSendAt = new Date(now.getTime() + delayMs).toISOString()

  const { error: advError } = await supabase
    .from('followup_enrollments')
    .update({
      status: 'scheduled',
      current_step_id: next.id,
      next_send_at: nextSendAt,
      updated_at: now.toISOString(),
    })
    .eq('id', args.enrollmentId)
    .eq('organization_id', args.organizationId)
    .eq('status', 'sending')

  if (advError) throw advError
  return { status: 'advanced', nextSendAt }
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

export async function exitFollowUp(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  args: { organizationId: string; enrollmentId: string; reason: string }
): Promise<void> {
  const { error } = await supabase
    .from('followup_enrollments')
    .update({
      status: 'exited',
      exit_reason: args.reason.slice(0, 120),
      next_send_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', args.organizationId)
    .eq('id', args.enrollmentId)
    .in('status', ['scheduled', 'eligible', 'sending'])

  if (error) throw error
}
