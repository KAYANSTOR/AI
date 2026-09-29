import type { SupabaseClient } from '@supabase/supabase-js'

export async function enqueueOutbound(args: {
  supabase: SupabaseClient
  organizationId: string
  businessId: string | null
  channelId: string
  eventType: string
  idempotencyKey: string
  recipient: string
  payload: Record<string, unknown>
  /** When set in the future, the outbox worker waits until this time. */
  scheduledAt?: string | Date | null
}) {
  const scheduledAt =
    args.scheduledAt instanceof Date
      ? args.scheduledAt.toISOString()
      : args.scheduledAt
        ? new Date(args.scheduledAt).toISOString()
        : new Date().toISOString()

  const { data, error } = await args.supabase
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
