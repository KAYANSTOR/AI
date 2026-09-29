import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'
import { OUTBOX_MAX_ATTEMPTS, enqueueOutbound, nextOutboxFailureState } from '@/lib/channels/outbox'

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
    const state = nextOutboxFailureState(20)
    expect(state.delayMs).toBe(60 * 60 * 1000)
  })

  test('the attempt ceiling parks the event as dead-letter instead of retrying forever', () => {
    expect(nextOutboxFailureState(OUTBOX_MAX_ATTEMPTS - 1).status).toBe('failed')
    expect(nextOutboxFailureState(OUTBOX_MAX_ATTEMPTS).status).toBe('dead_letter')
    expect(nextOutboxFailureState(OUTBOX_MAX_ATTEMPTS + 5).status).toBe('dead_letter')
  })

  test('the attempt count carries forward so the ceiling is reachable', () => {
    let attempts = 0
    let status = 'pending'
    while (status !== 'dead_letter') {
      attempts += 1
      status = nextOutboxFailureState(attempts).status
      if (attempts > 50) throw new Error('never reached dead-letter')
    }
    expect(attempts).toBe(OUTBOX_MAX_ATTEMPTS)
  })
})

describe('outbox enqueue', () => {
  test('queues a pending event', async () => {
    const fake = createFakeSupabase({ outbox_events: { unique: [['organization_id', 'idempotency_key']] } })
    const supabase = fake.client as unknown as SupabaseClient

    const id = await enqueueOutbound({
      supabase,
      organizationId: 'org-1',
      businessId: 'biz-1',
      channelId: 'chan-1',
      eventType: 'message.send',
      idempotencyKey: 'whatsapp:evt-1:reply',
      recipient: '+15550001',
      payload: { body: 'hello' },
    })

    expect(id).toBeTruthy()
    expect(fake.db.outbox_events.rows?.[0]?.status).toBe('pending')
  })

  test('re-queueing the same idempotency key does not create a second send', async () => {
    const fake = createFakeSupabase({ outbox_events: { unique: [['organization_id', 'idempotency_key']] } })
    const supabase = fake.client as unknown as SupabaseClient
    const args = {
      supabase,
      organizationId: 'org-1',
      businessId: 'biz-1',
      channelId: 'chan-1',
      eventType: 'message.send',
      idempotencyKey: 'whatsapp:evt-1:reply',
      recipient: '+15550001',
      payload: { body: 'hello' },
    }

    expect(await enqueueOutbound(args)).toBeTruthy()
    expect(await enqueueOutbound(args)).toBe('')
    expect(fake.db.outbox_events.rows?.length).toBe(1)
  })
})
