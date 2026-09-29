import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { advanceWorkflowRun } from '@/lib/workflows/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: runs, error } = await supabase
    .from('workflow_runs')
    .select('id, organization_id, status, wait_until')
    .in('status', ['running', 'waiting'])
    .or(`wait_until.is.null,wait_until.lte.${now}`)
    .order('updated_at', { ascending: true })
    .limit(40)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let advanced = 0
  let failed = 0

  for (const run of runs ?? []) {
    try {
      await advanceWorkflowRun(supabase, {
        organizationId: run.organization_id,
        runId: run.id,
      })
      advanced++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ due: runs?.length ?? 0, advanced, failed })
}

export const GET = handle
export const POST = handle
