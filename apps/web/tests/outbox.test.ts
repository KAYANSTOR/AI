import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  OUTBOX_MAX_ATTEMPTS,
  claimOutboundEvent,
  enqueueOutbound,
  nextOutboxFailureState,
} from '@/lib/channels/outbox'
import { createFakeDb } from './support/fake-db'

describe('outbox retry policy', () => {
  test('a failed send is retried with exponential backoff', () => {
    const now = new Date('2026-03-01T00:00:00.000Z')
    const first = nextOutboxFailureState(1, now)
    const second = nextOutboxFailureState(2, now)
    const third = nextOutboxFailureState(3, now)

    expect(first.status).toBe('failed')
    expect(first.delayMs).toBe(2_000)
    expect(second.delayMs).toBe(4_000)
    expect(third.delayMs).toBe(8_000)
    expect(third.nextAttemptAt).toBe(new Date(now.getTime() + 8_000).toISOString())
  })

  test('backoff is capped so a retry never waits longer than an hour', () => {
    expect(nextOutboxFailureState(20).delayMs).toBe(60 * 60 * 1000)
  })

  test('the attempt ceiling parks an event as dead-letter instead of retrying forever', () => {
    expect(nextOutboxFailureState(OUTBOX_MAX_ATTEMPTS - 1).status).toBe('failed')
    expect(nextOutboxFailureState(OUTBOX_MAX_ATTEMPTS).status).toBe('dead_letter')
  })
})

const baseArgs = {
  organizationId: 'org-1',
  businessId: 'biz-1',
  channelId: 'channel-1',
  eventType: 'message.send',
  idempotencyKey: 'whatsapp:evt-1:reply',
  recipient: '+15550001',
  payload: { body: 'hello', conversation_id: 'conversation-1' },
}

function existingOutboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    organization_id: baseArgs.organizationId,
    business_id: baseArgs.businessId,
    channel_id: baseArgs.channelId,
    event_type: baseArgs.eventType,
    idempotency_key: baseArgs.idempotencyKey,
    recipient: baseArgs.recipient,
    payload: baseArgs.payload,
    ...overrides,
  }
}

describe('durable outbound intent', () => {
  test('creates and claims an outbound intent before the network send', async () => {
    const fake = createFakeDb({
      outbox_events: { unique: [['organization_id', 'idempotency_key']] },
    })
    const result = await claimOutboundEvent(fake.client as unknown as DbClient, baseArgs)

    expect(result.status).toBe('claimed')
    if (result.status !== 'claimed') throw new Error('expected claim')
    expect(result.attempts).toBe(1)
    expect(fake.store.outbox_events.rows?.[0]?.status).toBe('processing')
  })

  test('a duplicate intent already being processed is not sent a second time', async () => {
    const fake = createFakeDb({
      outbox_events: {
        rows: [existingOutboxRow({
          status: 'processing',
          attempts: 1,
          scheduled_at: new Date().toISOString(),
          locked_at: new Date().toISOString(),
        })],
        unique: [['organization_id', 'idempotency_key']],
      },
    })
    const result = await claimOutboundEvent(fake.client as unknown as DbClient, baseArgs)

    expect(result).toEqual({ status: 'queued' })
    expect(fake.store.outbox_events.rows?.length).toBe(1)
  })

  test('a previously sent intent is acknowledged without another send', async () => {
    const fake = createFakeDb({
      outbox_events: {
        rows: [existingOutboxRow({ status: 'sent', attempts: 1, scheduled_at: new Date().toISOString() })],
        unique: [['organization_id', 'idempotency_key']],
      },
    })
    expect(await claimOutboundEvent(fake.client as unknown as DbClient, baseArgs)).toEqual({ status: 'sent' })
  })

  test('a permanent failure stays blocked instead of being retried', async () => {
    const fake = createFakeDb({
      outbox_events: {
        rows: [existingOutboxRow({ status: 'dead_letter', attempts: 1, scheduled_at: new Date().toISOString() })],
        unique: [['organization_id', 'idempotency_key']],
      },
    })
    expect(await claimOutboundEvent(fake.client as unknown as DbClient, baseArgs)).toEqual({ status: 'blocked' })
  })

  test('a failed intent is reclaimed only after its scheduled retry time', async () => {
    const fake = createFakeDb({
      outbox_events: {
        rows: [existingOutboxRow({
          status: 'failed',
          attempts: 1,
          scheduled_at: '2000-01-01T00:00:00.000Z',
        })],
        unique: [['organization_id', 'idempotency_key']],
      },
    })
    const result = await claimOutboundEvent(fake.client as unknown as DbClient, baseArgs)
    expect(result.status).toBe('claimed')
    if (result.status !== 'claimed') throw new Error('expected claim')
    expect(result.attempts).toBe(2)
  })

  test('re-enqueueing the same idempotency key never creates a second outbox row', async () => {
    const fake = createFakeDb({
      outbox_events: { unique: [['organization_id', 'idempotency_key']] },
    })
    const db = fake.client as unknown as DbClient
    expect(await enqueueOutbound({ db, ...baseArgs })).toBeTruthy()
    expect(await enqueueOutbound({ db, ...baseArgs })).toBe('')
    expect(fake.store.outbox_events.rows?.length).toBe(1)
  })
})
