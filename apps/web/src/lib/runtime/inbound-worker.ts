import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/db/admin'
import { markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { drainOutbox } from '@/lib/channels/outbox-drain'

type InboundPayload = {
  channelId: string
  organizationId: string
  businessId: string
  externalEventId: string
  senderJid: string
  senderPhone?: string | null
  displayName?: string | null
  text: string
  providerAccountId?: string | null
  externalIdentifier?: string | null
}
type InboundJob = {
  id: string
  webhook_event_id: string | null
  idempotency_key: string
  attempts: number
  payload: InboundPayload
}
const workerId = `inbound-${process.pid}-${randomUUID().slice(0, 8)}`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let stopping = false
let lastRecoveryAt = 0
let lastOutboxDrainAt = 0
const OUTBOX_DRAIN_INTERVAL_MS = Number(process.env.OUTBOX_DRAIN_INTERVAL_MS || 10_000)

/**
 * Replies that could not be delivered inline (gateway reconnecting, provider
 * rate limit, …) and messages queued by HTTP routes wait in outbox_events.
 * Draining from this always-on process keeps delivery within seconds instead
 * of depending on the external scheduler, which GitHub throttles to hours.
 */
async function drainOutboxPeriodically(db: ReturnType<typeof createAdminClient>) {
  if (Date.now() - lastOutboxDrainAt < OUTBOX_DRAIN_INTERVAL_MS) return
  lastOutboxDrainAt = Date.now()
  try {
    const result = await drainOutbox(db, { limit: 25 })
    if (result.processed > 0) console.log('outbox_drain_completed', { workerId, ...result })
  } catch (error) {
    console.error('outbox_drain_failed', { workerId, reason: error instanceof Error ? error.message : 'drain_error' })
  }
}

async function recoverStaleJobs(db: ReturnType<typeof createAdminClient>) {
  if (Date.now() - lastRecoveryAt < 30_000) return
  lastRecoveryAt = Date.now()
  const { data, error } = await db.rpc('recover_stale_inbound_jobs', { p_stale_after_seconds: 300 })
  if (error) {
    console.error('inbound_worker_recovery_failed', { reason: error.message })
    return
  }
  const recovered = Number(data ?? 0)
  if (recovered > 0) console.warn('inbound_worker_jobs_recovered', { workerId, recovered })
}

async function claimJob(db: ReturnType<typeof createAdminClient>): Promise<InboundJob | null> {
  const { data, error } = await db.rpc('claim_inbound_job', { p_worker: workerId })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as InboundJob | null
  return row?.id ? row : null
}

async function processJob(db: ReturnType<typeof createAdminClient>, job: InboundJob) {
  const input = job.payload
  console.log('inbound_job_processing', { jobId: job.id, channelId: input.channelId, attempt: job.attempts })
  const result = await processInboundMessage(db, {
    organizationId: input.organizationId,
    businessId: input.businessId,
    channelId: input.channelId,
    channelType: 'whatsapp',
    provider: 'whatsapp',
    externalEventId: input.externalEventId,
    externalUserId: input.senderPhone || input.senderJid,
    senderPhone: input.senderPhone || null,
    displayName: input.displayName || null,
    text: input.text,
  })
  if (result.reply) {
    const delivery = await deliverOutbound(db, {
      channel: {
        id: input.channelId,
        organizationId: input.organizationId,
        businessId: input.businessId,
        channelType: 'whatsapp',
        providerAccountId: input.providerAccountId || null,
        externalIdentifier: input.externalIdentifier || null,
      },
      recipient: input.senderPhone || input.senderJid,
      body: result.reply,
      idempotencyKey: input.externalEventId + ':reply',
      conversationId: result.conversationId,
      // This worker is a background process: send now, keep the outbox for retries.
      deliverInline: true,
      senderType: 'ai',
    })
    console.log('inbound_job_reply_delivery', { jobId: job.id, channelId: input.channelId, delivery })
    if (delivery === 'sent') {
      await recordDeliveredOutboundMessage(db, {
        organizationId: input.organizationId,
        conversationId: result.conversationId,
        body: result.reply,
        idempotencyKey: input.externalEventId + ':reply',
        senderType: 'ai',
      })
    }
  }
  if (job.webhook_event_id) await markWebhookProcessed(db, job.webhook_event_id, 'processed')
  const { error } = await db.from('inbound_jobs').update({
    status: 'completed', locked_at: null, locked_by: null, last_error: null,
    completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('status', 'processing')
  if (error) throw new Error(error.message)
  console.log('inbound_job_completed', { jobId: job.id, channelId: input.channelId, hadReply: Boolean(result.reply) })
}

async function failJob(db: ReturnType<typeof createAdminClient>, job: InboundJob, error: unknown) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  const terminal = job.attempts >= 3
  const patch = terminal
    ? { status: 'dead_letter', locked_at: null, locked_by: null, last_error: reason, updated_at: new Date().toISOString() }
    : {
        status: 'queued', locked_at: null, locked_by: null, last_error: reason,
        available_at: new Date(Date.now() + Math.min(30_000, 2 ** job.attempts * 1000)).toISOString(),
        updated_at: new Date().toISOString(),
      }
  await db.from('inbound_jobs').update(patch).eq('id', job.id).eq('status', 'processing')
  if (job.webhook_event_id && terminal) await markWebhookProcessed(db, job.webhook_event_id, 'failed', reason)
  console.error(terminal ? 'inbound_job_dead_letter' : 'inbound_job_retry_scheduled', {
    jobId: job.id, channelId: job.payload.channelId, attempt: job.attempts, reason,
  })
}

async function main() {
  const db = createAdminClient()
  console.log('inbound_worker_started', { workerId })
  while (!stopping) {
    await recoverStaleJobs(db)
    await drainOutboxPeriodically(db)
    try {
      const job = await claimJob(db)
      if (!job) {
        await sleep(1500)
        continue
      }
      try {
        await processJob(db, job)
      } catch (error) {
        await failJob(db, job, error)
      }
    } catch (error) {
      console.error('inbound_worker_cycle_failed', { reason: error instanceof Error ? error.message : 'worker_error' })
      await sleep(2000)
    }
  }
  await db.from('inbound_jobs').update({ status: 'queued', locked_at: null, locked_by: null, available_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('status', 'processing').eq('locked_by', workerId)
  console.log('inbound_worker_stopped', { workerId })
}
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })
main().catch((error) => {
  console.error('inbound_worker_fatal', { reason: error instanceof Error ? error.message : 'worker_fatal' })
  process.exit(1)
})
