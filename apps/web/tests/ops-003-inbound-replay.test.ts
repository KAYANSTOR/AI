import { afterEach, describe, expect, test } from 'bun:test'
import { runInboundJobTurn } from '@/lib/runtime/inbound-job'
import { setAgentTurnRunner } from '@/lib/runtime/process-inbound'
import {
  EXT_CHANNEL,
  EXT_COORDINATION_TEXT,
  claimNextJob,
  createExtWorld,
  enqueueQrInbound,
  installExtGuards,
  primeOwnerLookup,
  processClaimedJob,
  resetExtRunners,
} from './support/ext-005-fixtures'

/**
 * OPS-003 — WhatsApp redelivered a provider id after the inbound row was committed
 * and PostgreSQL raised `ux_messages_external`. The turn must decide from durable
 * evidence whether the reply already happened instead of answering or charging twice.
 */
afterEach(() => {
  resetExtRunners()
})

function setup() {
  const world = createExtWorld()
  installExtGuards()
  void primeOwnerLookup()
  let calls = 0
  setAgentTurnRunner(async () => {
    calls += 1
    return 'سأوصل رسالتك إلى صاحب الحساب.'
  })
  return { ...world, calls: () => calls }
}

describe('OPS-003 duplicate inbound storage', () => {
  test('a replay after a completed turn is suppressed without a second model call', async () => {
    const { db, store, calls } = setup()
    const eventId = `qr:${EXT_CHANNEL}:ops003-replay`
    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')

    const first = await processClaimedJob(db, job)
    expect(first.reply).not.toBeNull()
    expect(calls()).toBe(1)
    expect(store.messages.rows).toHaveLength(1)
    expect(store.outbox_events.rows).toHaveLength(1)

    const replay = await runInboundJobTurn(db, job.payload, {}, { attempts: 2 })
    expect(replay.reply).toBeNull()
    expect(replay.deduplication).toBe('duplicate_suppressed')
    expect(calls()).toBe(1)
    expect(store.messages.rows).toHaveLength(1)
    expect(store.outbox_events.rows).toHaveLength(1)
  })

  test('a retry that crashed before reserving the reply resumes instead of dropping the message', async () => {
    const { db, store, calls } = setup()
    const eventId = `qr:${EXT_CHANNEL}:ops003-resume`
    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')

    const first = await runInboundJobTurn(db, job.payload, {}, { attempts: 1 })
    expect(first.reply).not.toBeNull()
    expect(calls()).toBe(1)
    // Simulate the worker crashing after the message insert and before the reply intent.
    store.outbox_events.rows = []

    const resumed = await runInboundJobTurn(db, job.payload, {}, { attempts: 2 })
    // The turn is resumed (a reply exists); the worker's deliverOutbound then reserves
    // the reply intent exactly once, as processClaimedJob does in production.
    expect(resumed.reply).not.toBeNull()
    expect(resumed.deduplication).toBe('duplicate_resumed')
    expect(calls()).toBe(2)
    expect(store.messages.rows).toHaveLength(1)
    expect(store.outbox_events.rows).toHaveLength(0)
  })

  test('the duplicate key is never silently turned into a second inbound row', async () => {
    const { db, store } = setup()
    const eventId = `qr:${EXT_CHANNEL}:ops003-single-row`
    await enqueueQrInbound(db, { eventId, text: EXT_COORDINATION_TEXT })
    const job = await claimNextJob(db)
    if (!job) throw new Error('expected a queued job')
    await processClaimedJob(db, job)
    await runInboundJobTurn(db, job.payload, {}, { attempts: 2 })
    expect(store.messages.rows?.filter((row) => row.external_message_id === eventId)).toHaveLength(1)
  })
})
