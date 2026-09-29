import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateSlaState } from '@/lib/sla'
import { createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Periodic SLA refresh for open conversations.
 * Escalation on first breach: high_priority notification to org (no member = org-wide).
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('conversations')
    .select(
      'id, organization_id, human_assignee_id, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, sla_state, status'
    )
    .in('sla_state', ['normal', 'at_risk', 'breached'])
    .neq('status', 'closed')
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  let breached = 0

  for (const row of rows ?? []) {
    const next = evaluateSlaState({
      firstResponseDueAt: row.first_response_due_at,
      resolutionDueAt: row.resolution_due_at,
      firstRespondedAt: row.first_responded_at,
      resolvedAt: row.resolved_at,
    })

    if (next === row.sla_state) continue

    const patch: Record<string, unknown> = { sla_state: next }
    if (next === 'breached' && row.sla_state !== 'breached') {
      patch.sla_breached_at = new Date().toISOString()
      breached++
      await createNotification(supabase, {
        organizationId: row.organization_id,
        memberId: row.human_assignee_id,
        entityType: 'conversation',
        entityId: row.id,
        notificationType: 'high_priority',
        title: 'تجاوز SLA',
        body: 'محادثة تجاوزت مهلة الاستجابة أو الحل.',
        idempotencyKey: `sla-breach:${row.id}`,
      })
    }

    const { error: updError } = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', row.id)
      .eq('organization_id', row.organization_id)

    if (!updError) updated++
  }

  return NextResponse.json({ scanned: rows?.length ?? 0, updated, breached })
}

export const GET = handle
export const POST = handle
