import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertMarketingAllowed, ConsentBlockedError } from '@/lib/channels/consent'
import { claimDueEnrollment, completeFollowUpStep, exitFollowUp } from '@/lib/followup'
import { deliverOutbound } from '@/lib/runtime/outbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Follow-up worker: claim due enrollments → consent check → deliver → advance.
 * Shares CRON_SECRET with the outbox worker. Duplicate delivery is prevented by
 * the conditional claim on status='scheduled'.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('followup_enrollments')
    .select('id, organization_id, contact_id, sequence_id, current_step_id')
    .eq('status', 'scheduled')
    .lte('next_send_at', now)
    .order('next_send_at', { ascending: true })
    .limit(40)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let claimed = 0
  let sent = 0
  let blocked = 0
  let completed = 0
  let failed = 0

  for (const row of due ?? []) {
    const advance = await claimDueEnrollment(supabase, row.id, row.organization_id)
    if (advance.status === 'skipped') continue
    if (advance.status === 'completed') {
      completed++
      continue
    }

    claimed++

    try {
      await assertMarketingAllowed(supabase, {
        contactId: advance.contactId,
        channel: advance.channel,
      })
    } catch (err) {
      if (err instanceof ConsentBlockedError) {
        await exitFollowUp(supabase, {
          organizationId: advance.organizationId,
          enrollmentId: advance.enrollmentId,
          reason: 'opted_out',
        })
        blocked++
        continue
      }
      throw err
    }

    // Resolve an active channel of the requested type for this org.
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier')
      .eq('organization_id', advance.organizationId)
      .eq('channel_type', advance.channel)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (channelError) throw new Error(channelError.message)
    if (!channel) {
      await exitFollowUp(supabase, {
        organizationId: advance.organizationId,
        enrollmentId: advance.enrollmentId,
        reason: 'channel_unavailable',
      })
      failed++
      continue
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone')
      .eq('id', advance.contactId)
      .eq('organization_id', advance.organizationId)
      .maybeSingle()

    const { data: identity } = await supabase
      .from('contact_identities')
      .select('external_user_id, external_phone')
      .eq('contact_id', advance.contactId)
      .eq('channel', advance.channel)
      .limit(1)
      .maybeSingle()

    const recipient =
      identity?.external_user_id ||
      identity?.external_phone ||
      contact?.phone ||
      ''

    if (!recipient) {
      await exitFollowUp(supabase, {
        organizationId: advance.organizationId,
        enrollmentId: advance.enrollmentId,
        reason: 'missing_recipient',
      })
      failed++
      continue
    }

    try {
      await deliverOutbound(supabase, {
        channel: {
          id: channel.id,
          organizationId: channel.organization_id,
          businessId: channel.business_id,
          channelType: channel.channel_type,
          providerAccountId: channel.provider_account_id,
          externalIdentifier: channel.external_identifier,
        },
        recipient,
        body: advance.templateContent,
        idempotencyKey: `followup:${advance.enrollmentId}:${advance.stepId}`,
        queueOnFailure: true,
      })

      const result = await completeFollowUpStep(supabase, {
        organizationId: advance.organizationId,
        enrollmentId: advance.enrollmentId,
        sequenceId: advance.sequenceId,
        completedStepId: advance.stepId,
      })

      sent++
      if (result.status === 'completed') completed++

      await supabase.from('audit_events').insert({
        organization_id: advance.organizationId,
        actor_type: 'system',
        action: 'followup.step_sent',
        entity_type: 'followup_enrollment',
        entity_id: advance.enrollmentId,
        metadata: {
          step_id: advance.stepId,
          channel: advance.channel,
          next: result.status,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'followup_send_failed'
      await supabase
        .from('followup_enrollments')
        .update({
          status: 'scheduled',
          exit_reason: message.slice(0, 120),
          updated_at: new Date().toISOString(),
        })
        .eq('id', advance.enrollmentId)
        .eq('organization_id', advance.organizationId)
        .eq('status', 'sending')
      failed++
    }
  }

  return NextResponse.json({ due: due?.length ?? 0, claimed, sent, blocked, completed, failed })
}

export const GET = handle
export const POST = handle
