import type { DbClient } from '@/lib/db/client'

export async function enqueueOutbound(args: {
  db: DbClient
  organizationId: string
  businessId: string | null
  channelId: string
  eventType: string
  idempotencyKey: string
  recipient: string
  payload: Record<string, unknown>
  scheduledAt?: string | Date | null
}) {
  const scheduledAt =
    args.scheduledAt instanceof Date
      ? args.scheduledAt.toISOString()
      : args.scheduledAt
        ? new Date(args.scheduledAt).toISOString()
        : new Date().toISOString()

  const { data, error } = await args.db
    .from('outbox_events')
    .insert({
      organization_id: args.organizationId,
      business_id: args.businessId,
      channel_id: args.channelId,
      event_type: args.eventType,
      idempotency_key: args.idempotencyKey,
      recipient: args.recipient,
      payload: args.payload,
      status: 'pending',
      scheduled_at: scheduledAt,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return ''
    throw new Error(error.message)
  }
  return data.id as string
}

export const OUTBOX_MAX_ATTEMPTS = 8
export const OUTBOX_STALE_LOCK_MS = 5 * 60 * 1000
const OUTBOX_MAX_BACKOFF_MS = 60 * 60 * 1000

export type OutboxFailureState = {
  attempts: number
  status: 'failed' | 'dead_letter'
  delayMs: number
  nextAttemptAt: string
}

export function nextOutboxFailureState(
  attempts: number,
  now: Date = new Date()
): OutboxFailureState {
  const exhausted = attempts >= OUTBOX_MAX_ATTEMPTS
  const delayMs = Math.min(OUTBOX_MAX_BACKOFF_MS, 2 ** attempts * 1000)
  return {
    attempts,
    status: exhausted ? 'dead_letter' : 'failed',
    delayMs,
    nextAttemptAt: new Date(now.getTime() + delayMs).toISOString(),
  }
}

export type OutboundClaimResult =
  | { status: 'claimed'; eventId: string; attempts: number }
  | { status: 'sent' }
  | { status: 'queued' }
  | { status: 'blocked' }

async function reserveOutboundEventAtomically(
  db: DbClient,
  args: {
    organizationId: string
    businessId: string | null
    channelId: string
    eventType: string
    idempotencyKey: string
    recipient: string
    payload: Record<string, unknown>
    reserveOnly?: boolean
  }
): Promise<OutboundClaimResult | null> {
  const { reserveOnly: _reserveOnly, ...rpcArgs } = args
  void _reserveOnly
  const { data, error } = await db.rpc('reserve_outbound_event', {
    p_organization_id: rpcArgs.organizationId,
    p_business_id: rpcArgs.businessId,
    p_channel_id: rpcArgs.channelId,
    p_event_type: rpcArgs.eventType,
    p_idempotency_key: rpcArgs.idempotencyKey,
    p_recipient: rpcArgs.recipient,
    p_payload: rpcArgs.payload,
  })
  if (error) {
    // The in-memory test double intentionally has no default RPC handlers.
    if (error.message.startsWith('rpc reserve_outbound_event is not registered')) return null
    throw new Error(error.message)
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (!row?.event_id) throw new Error('outbound_reservation_invalid')
  const status = String(row.status ?? '')
  if (status === 'sent') return { status: 'sent' }
  if (status === 'dead_letter' || status === 'cancelled') return { status: 'blocked' }
  if (status === 'processing') return { status: 'queued' }
  if (status !== 'pending' && status !== 'failed') return { status: 'blocked' }
  // A freshly reserved row is returned as 'pending' and is not locked yet. Lock
  // it explicitly so exactly one sender owns it and the sent/failed state
  // transitions (which require status='processing') succeed.
  if (args.reserveOnly) return { status: 'queued' }
  const scheduledAt = row.scheduled_at ? new Date(String(row.scheduled_at)).getTime() : 0
  if (Number.isFinite(scheduledAt) && scheduledAt > Date.now()) return { status: 'queued' }
  const attempts = Number(row.attempts ?? 0) + 1
  const { data: locked, error: lockError } = await db
    .from('outbox_events')
    .update({ status: 'processing', attempts, locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', String(row.event_id))
    .eq('status', status)
    .select('id')
    .maybeSingle()
  if (lockError) throw new Error(lockError.message)
  if (!locked?.id) return { status: 'queued' }
  return { status: 'claimed', eventId: String(row.event_id), attempts }
}

/**
 * Creates a durable outbound intent before the network call, then atomically claims
 * it for the inline sender. The unique organization/idempotency key prevents a
 * webhook redelivery from sending the same customer reply twice.
 */
export async function claimOutboundEvent(
  db: DbClient,
  args: {
    organizationId: string
    businessId: string | null
    channelId: string
    eventType: string
    idempotencyKey: string
    recipient: string
    payload: Record<string, unknown>
    /** Persist the intent without locking it (the outbox drain will send it). */
    reserveOnly?: boolean
  },
  now?: Date
): Promise<OutboundClaimResult> {
  const atomicResult = await reserveOutboundEventAtomically(db, args)
  if (atomicResult) return atomicResult

  const { reserveOnly, ...enqueueArgs } = args
  await enqueueOutbound({ db, ...enqueueArgs })
  const claimNow = now ?? new Date()

  const { data: event, error } = await db
    .from('outbox_events')
    .select('id,status,attempts,scheduled_at')
    .eq('organization_id', args.organizationId)
    .eq('idempotency_key', args.idempotencyKey)
    .maybeSingle()

  if (error || !event) throw new Error(error?.message || 'outbound_intent_not_found')

  const status = String(event.status ?? '')
  if (status === 'sent') return { status: 'sent' }
  if (status === 'dead_letter' || status === 'cancelled') return { status: 'blocked' }
  if (status === 'processing') return { status: 'queued' }
  if (status !== 'pending' && status !== 'failed') return { status: 'blocked' }
  if (reserveOnly) return { status: 'queued' }

  const attempts = Number(event.attempts ?? 0)
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await db
      .from('outbox_events')
      .update({ status: 'dead_letter', last_error: 'max_attempts_reached', locked_at: null, updated_at: claimNow.toISOString() })
      .eq('id', event.id)
      .eq('status', status)
    return { status: 'blocked' }
  }

  const scheduledAt = event.scheduled_at ? new Date(String(event.scheduled_at)).getTime() : 0
  if (Number.isFinite(scheduledAt) && scheduledAt > claimNow.getTime()) {
    return { status: 'queued' }
  }

  const nextAttempts = attempts + 1
  const { data: claim, error: claimError } = await db
    .from('outbox_events')
    .update({
      status: 'processing',
      attempts: nextAttempts,
      locked_at: claimNow.toISOString(),
      updated_at: claimNow.toISOString(),
    })
    .eq('id', event.id)
    .eq('status', status)
    .select('id')
    .maybeSingle()

  if (claimError) throw new Error(claimError.message)
  if (!claim?.id) return { status: 'queued' }

  return { status: 'claimed', eventId: String(event.id), attempts: nextAttempts }
}
