import type { DbClient } from '@/lib/db/client'
import type { InboundPayload } from '@/lib/runtime/inbound-job'

export type InboundEnqueueResult =
  | { ok: true; jobId: string | null; requeued: boolean }
  | { ok: false; message: string }

/**
 * EXT-005 — enqueue one inbound job per provider event id without losing retries.
 *
 * `inbound_jobs.idempotency_key` is UNIQUE, so a plain insert turns a legitimate
 * retry into a conflict: the webhook may be re-claimed after a failure or a stale
 * lock while the old job row still exists. This helper reconciles that conflict
 * instead of failing the delivery:
 *
 * - no row            -> insert;
 * - `dead_letter` row -> requeue it (the previous attempt failed terminally);
 * - any other status  -> acknowledge, the existing row already owns the work.
 *
 * Atomicity of the claim itself stays in Postgres (`claim_inbound_job`,
 * `recover_stale_inbound_jobs`); this only decides what a duplicate enqueue means.
 */
export async function enqueueInboundJob(
  db: DbClient,
  input: {
    organizationId: string
    businessId: string | null
    channelId: string
    webhookEventId: string | null
    idempotencyKey: string
    payload: InboundPayload
  }
): Promise<InboundEnqueueResult> {
  const { data, error } = await db
    .from('inbound_jobs')
    .insert({
      organization_id: input.organizationId,
      business_id: input.businessId,
      channel_id: input.channelId,
      webhook_event_id: input.webhookEventId,
      idempotency_key: input.idempotencyKey,
      status: 'queued',
      payload: input.payload,
    })
    .select('id')
    .maybeSingle()

  if (!error) return { ok: true, jobId: data?.id ?? null, requeued: false }
  if (error.code !== '23505') return { ok: false, message: error.message }

  const { data: existing, error: readError } = await db
    .from('inbound_jobs')
    .select('id, status')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()

  if (readError || !existing) {
    return { ok: false, message: readError?.message ?? 'inbound_job_conflict_unresolved' }
  }

  const status = String(existing.status ?? '')
  if (status !== 'dead_letter') return { ok: true, jobId: String(existing.id), requeued: false }

  const now = new Date().toISOString()
  const { error: requeueError } = await db
    .from('inbound_jobs')
    .update({
      status: 'queued',
      available_at: now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      completed_at: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('status', 'dead_letter')

  if (requeueError) return { ok: false, message: requeueError.message }
  return { ok: true, jobId: String(existing.id), requeued: true }
}
