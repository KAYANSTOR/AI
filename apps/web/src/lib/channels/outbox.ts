import type { SupabaseClient } from '@supabase/supabase-js'

export async function enqueueOutbound(args:{
  supabase:SupabaseClient;organizationId:string;businessId:string|null;channelId:string;
  eventType:string;idempotencyKey:string;recipient:string;payload:Record<string,unknown>
}){
  const {data,error}=await args.supabase.from('outbox_events').insert({
    organization_id:args.organizationId,business_id:args.businessId,channel_id:args.channelId,event_type:args.eventType,
    idempotency_key:args.idempotencyKey,recipient:args.recipient,payload:args.payload,status:'pending',
  }).select('id').single()
  if(error){
    if(error.code==='23505') return ''
    throw new Error(error.message)
  }
  return data.id as string
}

/** Attempts allowed before an event is parked as dead-letter instead of retried. */
export const OUTBOX_MAX_ATTEMPTS = 8

/**
 * A worker that dies mid-send leaves its row in 'processing'. Rows older than this
 * window become claimable again instead of being stuck forever.
 */
export const OUTBOX_STALE_LOCK_MS = 5 * 60 * 1000

const OUTBOX_MAX_BACKOFF_MS = 60 * 60 * 1000

export type OutboxFailureState = {
  attempts: number
  status: 'failed' | 'dead_letter'
  delayMs: number
  nextAttemptAt: string
}

/**
 * The retry policy lives here, not inside the cron handler, so the exponential
 * backoff, the attempt ceiling and the dead-letter transition have one definition
 * that both the worker and the tests use.
 *
 * `attempts` is the attempt count *including* the one that just failed.
 */
export function nextOutboxFailureState(attempts: number, now: Date = new Date()): OutboxFailureState {
  const exhausted = attempts >= OUTBOX_MAX_ATTEMPTS
  const delayMs = Math.min(OUTBOX_MAX_BACKOFF_MS, 2 ** attempts * 1000)
  return {
    attempts,
    status: exhausted ? 'dead_letter' : 'failed',
    delayMs,
    nextAttemptAt: new Date(now.getTime() + delayMs).toISOString(),
  }
}
