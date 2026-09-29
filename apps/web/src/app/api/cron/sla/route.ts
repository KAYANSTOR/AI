import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateSlaState } from '@/lib/sla'
import { runEscalationPolicies } from '@/lib/escalation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  let warned = 0
  let escalations = 0

  for (const row of rows ?? []) {
    const next = evaluateSlaState({
      firstResponseDueAt: row.first_response_due_at,
      resolutionDueAt: row.resolution_due_at,
      firstRespondedAt: row.first_responded_at,
      resolvedAt: row.resolved_at,
    })

    if (next === row.sla_state) continue

    const patch: Record<string, unknown> = { sla_state: next }

    if (next === 'at_risk' && row.sla_state === 'normal') {
      warned++
      const result = await runEscalationPolicies(supabase, {
        organizationId: row.organization_id,
        conversationId: row.id,
        trigger: 'sla_warning',
        assigneeMemberId: row.human_assignee_id,
      })
      escalations += result.notified
    }

    if (next === 'breached' && row.sla_state !== 'breached') {
      patch.sla_breached_at = new Date().toISOString()
      breached++
      const result = await runEscalationPolicies(supabase, {
        organizationId: row.organization_id,
        conversationId: row.id,
        trigger: 'sla_breach',
        assigneeMemberId: row.human_assignee_id,
      })
      escalations += result.notified
    }

    const { error: updError } = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', row.id)
      .eq('organization_id', row.organization_id)

    if (!updError) updated++
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    updated,
    warned,
    breached,
    escalations,
  })
}

export const GET = handle
export const POST = handle
