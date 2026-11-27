import { NextResponse } from 'next/server'
import { requireExecutiveAssistantApi } from '@/lib/personal-assistant/api-context'
import { decideApproval, setKillSwitch } from '@/lib/personal-assistant/executive/engine'
import { buildEngineDeps } from '@/lib/central-bot/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH_RE = /^[0-9a-f]{64}$/

/** Tasks, pending approvals and receipts of this owner (RLS-scoped reads). */
export async function GET() {
  const access = await requireExecutiveAssistantApi()
  if (access instanceof NextResponse) return access
  const scope = (table: string, columns: string) => access.db.from(table).select(columns)
    .eq('org_id', access.owner.organizationId).eq('user_id', access.owner.userId)
  const [tasks, approvals, receipts, link] = await Promise.all([
    scope('agent_tasks', 'id, goal, state, risk_level, plan_json, last_error, created_at, updated_at').order('created_at', { ascending: false }).limit(50),
    scope('agent_approvals', 'id, task_id, summary_ar, payload_hash, status, expires_at, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    scope('agent_receipts', 'id, task_id, summary_ar, executed_actions_json, untouched_scope_note, created_at').order('created_at', { ascending: false }).limit(50),
    scope('personal_assistant_links', 'kill_switch_active').maybeSingle(),
  ])
  if (tasks.error || approvals.error || receipts.error || link.error) {
    console.error('assistant_agent_read_failed', { tasks: Boolean(tasks.error), approvals: Boolean(approvals.error), receipts: Boolean(receipts.error), link: Boolean(link.error) })
    return NextResponse.json({ error: 'agent_list_failed' }, { status: 500 })
  }
  return NextResponse.json({
    tasks: tasks.data ?? [],
    approvals: approvals.data ?? [],
    receipts: receipts.data ?? [],
    killSwitchActive: (link.data as { kill_switch_active?: boolean } | null)?.kill_switch_active === true,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const access = await requireExecutiveAssistantApi()
  if (access instanceof NextResponse) return access
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  const engine = buildEngineDeps(access.admin)

  if (body.type === 'kill_switch') {
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'invalid_active' }, { status: 400 })
    const result = await setKillSwitch(access.admin, access.owner, body.active, engine)
    return NextResponse.json({ ok: true, ...result })
  }

  if (body.type === 'approval') {
    const approvalId = typeof body.approvalId === 'string' ? body.approvalId : ''
    const decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : null
    const hash = typeof body.hash === 'string' ? body.hash : ''
    if (!UUID_RE.test(approvalId) || !decision) return NextResponse.json({ error: 'invalid_approval' }, { status: 400 })
    if (decision === 'approve' && !HASH_RE.test(hash)) return NextResponse.json({ error: 'invalid_hash' }, { status: 400 })
    const result = await decideApproval(access.admin, access.owner, { approvalId, decision, providedHash: decision === 'approve' ? hash : null, via: 'web' }, engine)
    const status = result.status === 'not_found' ? 404 : result.status === 'already_decided' ? 409 : result.status === 'approved' ? 200 : 422
    return NextResponse.json(result, { status })
  }

  return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
}
