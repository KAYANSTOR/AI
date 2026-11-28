import { afterEach, describe, expect, test } from 'bun:test'
import { deliverOutbound } from '@/lib/runtime/outbound'
import { setAgentTurnRunner } from '@/lib/runtime/process-inbound'
import {
  EXT_CHANNEL,
  EXT_COORDINATION_TEXT,
  EXT_FRIEND_PHONE,
  EXT_ORG,
  EXT_BIZ,
  claimNextJob,
  createExtWorld,
  enqueueQrInbound,
  installExtGuards,
  primeOwnerLookup,
  processClaimedJob,
  resetExtRunners,
} from './support/ext-005-fixtures'

afterEach(() => {
  resetExtRunners()
})

function setup(reply = 'سأوصل رسالتك إلى صاحب الحساب.') {
  const world = createExtWorld()
  installExtGuards()
  void primeOwnerLookup()
  setAgentTurnRunner(async () => reply)
  return world
}

describe('EXT-005 end-to-end idempotency on the QR inbound path', () => {
  test('a redelivered provider event id is acknowledged without a second job', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-redelivery-1`

    expect((await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })).status).toBe('acquired')
    const second = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })

    expect(second.status).toBe('duplicate')
    expect(store.webhook_events.rows).toHaveLength(1)
    expect(store.inbound_jobs.rows).toHaveLength(1)
  })

  test('concurrent redeliveries of one event id enqueue exactly one job', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-concurrent-1`

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT }))
    )

    expect(outcomes.filter((item) => item.status === 'acquired')).toHaveLength(1)
    expect(outcomes.filter((item) => item.status === 'duplicate')).toHaveLength(4)
    expect(store.inbound_jobs.rows).toHaveLength(1)
  })

  test('a replay after the message was processed stays a duplicate and sends nothing new', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-replay-1`

    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')
    const first = await processClaimedJob(db, job)
    expect(first.reply).not.toBeNull()
    expect(store.outbox_events.rows).toHaveLength(1)

    const replay = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    expect(replay.status).toBe('duplicate')
    expect(store.inbound_jobs.rows).toHaveLength(1)
    expect(store.outbox_events.rows).toHaveLength(1)
    expect(store.webhook_events.rows?.[0]?.processing_status).toBe('processed')
  })

  test('a dead-lettered job is requeued on redelivery instead of being dropped by the unique key', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-retry-1`

    const first = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    if (first.status !== 'acquired' || !first.eventRowId) throw new Error('expected first claim')
    await db.from('webhook_events').update({ processing_status: 'failed' }).eq('id', first.eventRowId)
    await db.from('inbound_jobs').update({ status: 'dead_letter', last_error: 'model_unavailable' })
      .eq('idempotency_key', eventId)

    const retry = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    expect(retry.status).toBe('acquired')
    expect(retry.requeued).toBe(true)
    expect(store.inbound_jobs.rows).toHaveLength(1)
    expect(store.inbound_jobs.rows?.[0]?.status).toBe('queued')
    expect(store.inbound_jobs.rows?.[0]?.last_error).toBeNull()
    expect(store.webhook_events.rows?.[0]?.attempt_count).toBe(2)

    const job = await claimNextJob(db)
    if (!job) throw new Error('expected the requeued job to be claimable')
    const processed = await processClaimedJob(db, job)
    expect(processed.reply).not.toBeNull()
    expect(store.outbox_events.rows).toHaveLength(1)
  })

  test('an abandoned processing lock is recovered after a worker crash', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-crash-1`

    const first = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    if (first.status !== 'acquired' || !first.eventRowId) throw new Error('expected first claim')
    const row = store.webhook_events.rows?.[0]
    if (!row) throw new Error('event missing')
    row.processing_started_at = '2000-01-01T00:00:00.000Z'
    row.processing_status = 'processing'

    const recovered = await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    expect(recovered.status).toBe('acquired')
    expect(recovered.requeued).toBe(false)
    expect(row.attempt_count).toBe(2)
    expect(store.inbound_jobs.rows).toHaveLength(1)
    expect(store.inbound_jobs.rows?.[0]?.status).toBe('queued')
  })

  test('identical text with distinct event ids is never deduplicated', async () => {
    const { db, store } = setup()
    const firstId = `qr:${EXT_CHANNEL}:synthetic-distinct-a`
    const secondId = `qr:${EXT_CHANNEL}:synthetic-distinct-b`

    expect((await enqueueQrInbound(db, { eventId: firstId, text: EXT_COORDINATION_TEXT })).status).toBe('acquired')
    expect((await enqueueQrInbound(db, { eventId: secondId, text: EXT_COORDINATION_TEXT })).status).toBe('acquired')

    const jobA = await claimNextJob(db)
    if (!jobA) throw new Error('expected first job')
    const replyA = await processClaimedJob(db, jobA)
    const jobB = await claimNextJob(db)
    if (!jobB) throw new Error('expected second job')
    const replyB = await processClaimedJob(db, jobB)

    expect(replyA.reply).not.toBeNull()
    expect(replyB.reply).not.toBeNull()
    expect(store.inbound_jobs.rows).toHaveLength(2)
    expect(store.outbox_events.rows).toHaveLength(2)
    expect(store.outbox_events.rows?.map((row) => row.idempotency_key)).toEqual([
      `${firstId}:reply`,
      `${secondId}:reply`,
    ])
  })

  test('one job cannot be claimed by two workers at the same time', async () => {
    const { db, store } = setup()
    await enqueueQrInbound(db, {
      eventId: `qr:${EXT_CHANNEL}:synthetic-exclusive-1`,
      text: EXT_COORDINATION_TEXT,
    })

    const [first, second] = await Promise.all([claimNextJob(db), claimNextJob(db)])
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(store.inbound_jobs.rows?.[0]?.status).toBe('processing')
  })

  test('a repeat delivery attempt reserves the same reply intent instead of sending twice', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-reply-once-1`
    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')
    await processClaimedJob(db, job)

    const repeat = await deliverOutbound(db, {
      channel: {
        id: EXT_CHANNEL,
        organizationId: EXT_ORG,
        businessId: EXT_BIZ,
        channelType: 'whatsapp',
        connectionMode: 'qr_unofficial',
        providerAccountId: null,
        externalIdentifier: null,
      },
      recipient: EXT_FRIEND_PHONE,
      body: 'سأوصل رسالتك إلى صاحب الحساب.',
      idempotencyKey: `${eventId}:reply`,
      senderType: 'ai',
    })

    expect(repeat).toBe('queued')
    expect(store.outbox_events.rows).toHaveLength(1)
  })

  test('the outbound intent keeps tenant and channel scope from the event', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:synthetic-scope-1`
    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')
    await processClaimedJob(db, job)

    const row = store.outbox_events.rows?.[0]
    expect(row?.organization_id).toBe(EXT_ORG)
    expect(row?.channel_id).toBe(EXT_CHANNEL)
    expect(job.payload.organizationId).toBe(EXT_ORG)
  })
})
