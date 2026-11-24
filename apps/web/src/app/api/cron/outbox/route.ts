import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import { publicWebhookError } from '@/lib/runtime/security'
import { drainOutbox } from '@/lib/channels/outbox-drain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await drainOutbox(createAdminClient()))
  } catch {
    return NextResponse.json({ error: publicWebhookError() }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
