import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import { processCampaignBatch } from '@/lib/campaigns'
import { DEFAULT_SEND_WINDOW, isInQuietHours } from '@/lib/channels/quiet-hours'
import { publicWebhookError } from '@/lib/runtime/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (isInQuietHours(DEFAULT_SEND_WINDOW)) {
    return NextResponse.json({ skipped: 'quiet_hours' })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // Promote due scheduled campaigns
  await db
    .from('campaigns')
    .update({ status: 'running', started_at: now, updated_at: now })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  const { data: running, error } = await db
    .from('campaigns')
    .select('id, organization_id')
    .eq('status', 'running')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: publicWebhookError() }, { status: 500 })

  let queued = 0
  let skipped = 0
  let failed = 0
  let completed = 0

  for (const c of running ?? []) {
    const result = await processCampaignBatch(db, {
      organizationId: c.organization_id,
      campaignId: c.id,
    })
    queued += result.queued
    skipped += result.skipped
    failed += result.failed
    if (result.completed) completed++
  }

  return NextResponse.json({
    campaigns: running?.length ?? 0,
    queued,
    skipped,
    failed,
    completed,
  })
}

export const GET = handle
export const POST = handle
