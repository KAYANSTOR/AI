import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverOutbound } from '@/lib/runtime/outbound'
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_LOCK_MS,
  nextOutboxFailureState,
} from '@/lib/channels/outbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  // Stale workers (crashed mid-send) leave rows in 'processing'; they become claimable
  // again after the lock window instead of being stuck forever.
  const staleBefore = new Date(Date.now() - OUTBOX_STALE_LOCK_MS).toISOString()
  const claimable = `status.in.(pending,failed),and(status.eq.processing,locked_at.lt.${staleBefore})`
  const { data: events, error } = await supabase.from('outbox_events')
    .select('id, organization_id, channel_id, recipient, payload, attempts')
    .or(claimable)
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', OUTBOX_MAX_ATTEMPTS)
    .order('scheduled_at')
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  for (const event of events ?? []) {
    const claim = await supabase.from('outbox_events')
      .update({ status: 'processing', attempts: Number(event.attempts ?? 0) + 1, locked_at: new Date().toISOString() })
      .eq('id', event.id)
      .or(claimable)
      .select('id')
      .maybeSingle()
    if (!claim.data) continue

    try {
      const { data: channel, error: channelError } = await supabase.from('channels')
        .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier')
        .eq('id', event.channel_id)
        .maybeSingle()
      if (channelError) throw new Error(channelError.message)
      if (!channel) throw new Error('channel_not_found')

      const payload = event.payload as Record<string, unknown>
      const body = String(payload.body ?? '')
      // Same delivery path as the live routes; failures here are recorded by the
      // worker itself so retries and dead-letter stay authoritative.
      await deliverOutbound(supabase, {
        channel: {
          id: channel.id,
          organizationId: channel.organization_id,
          businessId: channel.business_id,
          channelType: channel.channel_type,
          providerAccountId: channel.provider_account_id,
          externalIdentifier: channel.external_identifier,
        },
        recipient: event.recipient,
        body,
        idempotencyKey: 'outbox:' + event.id,
        queueOnFailure: false,
      })

      await supabase.from('outbox_events').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', event.id)
      sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'outbox delivery failed'
      const failure = nextOutboxFailureState(Number(event.attempts ?? 0) + 1)
      await supabase.from('outbox_events').update({
        status: failure.status,
        last_error: message.slice(0, 500),
        scheduled_at: failure.nextAttemptAt,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id)
    }
  }
  return NextResponse.json({ processed: events?.length ?? 0, sent })
}
