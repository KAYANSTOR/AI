import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { publicWebhookError } from '@/lib/runtime/security'
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_LOCK_MS,
  nextOutboxFailureState,
} from '@/lib/channels/outbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = createAdminClient()
  // Stale workers (crashed mid-send) leave rows in 'processing'; they become claimable
  // again after the lock window instead of being stuck forever.
  const staleBefore = new Date(Date.now() - OUTBOX_STALE_LOCK_MS).toISOString()
  const claimable = `status.in.(pending,failed),and(status.eq.processing,locked_at.lt.${staleBefore})`
  const { data: events, error } = await db.from('outbox_events')
    .select('id, organization_id, channel_id, recipient, payload, attempts, idempotency_key')
    .or(claimable)
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', OUTBOX_MAX_ATTEMPTS)
    .order('scheduled_at')
    .limit(50)
  if (error) return NextResponse.json({ error: publicWebhookError() }, { status: 500 })

  // One lookup for every channel in this batch instead of one per event.
  const channelIds = [...new Set((events ?? []).map((event) => event.channel_id as string | null).filter((id): id is string => Boolean(id)))]
  const channelsResult = channelIds.length
    ? await db.from('channels')
        .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier')
        .in('id', channelIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  const channelsById = new Map<string, Record<string, unknown>>()
  for (const row of channelsResult.data ?? []) channelsById.set(row.id as string, row)

  let sent = 0
  for (const event of events ?? []) {
    const claim = await db.from('outbox_events')
      .update({ status: 'processing', attempts: Number(event.attempts ?? 0) + 1, locked_at: new Date().toISOString() })
      .eq('id', event.id)
      .or(claimable)
      .select('id')
      .maybeSingle()
    if (!claim.data) continue

    try {
      // A failed batch lookup fails each event individually (same retry/backoff path as before).
      if (channelsResult.error) throw new Error(channelsResult.error.message)
      const channel = channelsById.get(event.channel_id as string) as
        | {
            id: string
            organization_id: string
            business_id: string | null
            channel_type: string
            provider_account_id: string | null
            external_identifier: string | null
          }
        | undefined
      if (!channel) throw new Error('channel_not_found')

      const payload = event.payload as Record<string, unknown>
      const body = String(payload.body ?? '')
      // Same delivery path as the live routes; failures here are recorded by the
      // worker itself so retries and dead-letter stay authoritative.
      await deliverOutbound(db, {
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
        conversationId: typeof payload.conversation_id === 'string' ? payload.conversation_id : null,
        queueOnFailure: false,
      })

      if (typeof payload.conversation_id === 'string' && payload.conversation_id) {
        await recordDeliveredOutboundMessage(db, {
          organizationId: event.organization_id,
          conversationId: payload.conversation_id,
          body,
          idempotencyKey: 'outbox:' + event.id,
        })
      }

      await db.from('outbox_events').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', event.id)
      sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'outbox delivery failed'
      const failure = nextOutboxFailureState(Number(event.attempts ?? 0) + 1)
      await db.from('outbox_events').update({
        status: failure.status,
        last_error: message.slice(0, 500),
        scheduled_at: failure.nextAttemptAt,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id)
    }
  }
  return NextResponse.json({ processed: events?.length ?? 0, sent })
}

export const GET = handle
export const POST = handle
