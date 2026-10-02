import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicWebhookError } from '@/lib/runtime/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Marks sent quotes whose valid_until has passed as expired.
 * Tenant-scoped updates; audit per batch via system actor.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('quotes')
    .select('id, organization_id')
    .eq('status', 'sent')
    .not('valid_until', 'is', null)
    .lt('valid_until', now)
    .limit(100)

  if (error) return NextResponse.json({ error: publicWebhookError() }, { status: 500 })

  let expired = 0
  for (const row of due ?? []) {
    const { data, error: updError } = await supabase
      .from('quotes')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .eq('organization_id', row.organization_id)
      .eq('status', 'sent')
      .select('id')
      .maybeSingle()

    if (updError || !data) continue
    expired++

    await supabase.from('audit_events').insert({
      organization_id: row.organization_id,
      actor_type: 'system',
      action: 'quote.expired',
      entity_type: 'quote',
      entity_id: row.id,
      metadata: { reason: 'valid_until_passed' },
    })
  }

  return NextResponse.json({ candidates: due?.length ?? 0, expired })
}

export const GET = handle
export const POST = handle
