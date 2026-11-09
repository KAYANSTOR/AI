import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb } from './support/fake-db'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'

function setup() {
  const fake = createFakeDb({
    webhook_events: { unique: [['provider', 'external_event_id']] },
  })
  return { store: fake.store, db: fake.client as unknown as DbClient }
}

describe('webhook idempotency', () => {
  test('the first delivery of an event is acquired', async () => {
    const { db } = setup()
    const result = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(result.status).toBe('acquired')
    if (result.status === 'acquired') expect(result.eventRowId).toBeTruthy()
  })

  test('a redelivered event is acknowledged as a duplicate without reprocessing', async () => {
    const { db, store } = setup()
    await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })
    const duplicate = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(duplicate.status).toBe('duplicate')
    expect(store.webhook_events.rows?.length).toBe(1)
  })

  test('the same provider event id on a different provider is a different event', async () => {
    const { db } = setup()
    await acquireWebhookEvent(db, 'whatsapp', 'shared-id', {})
    expect((await acquireWebhookEvent(db, 'instagram', 'shared-id', {})).status).toBe('acquired')
  })

  test('a duplicate is never reported as an error', async () => {
    const { db } = setup()
    await acquireWebhookEvent(db, 'vapi', 'call-1', {})
    const second = await acquireWebhookEvent(db, 'vapi', 'call-1', {})
    expect(second).toEqual({ status: 'duplicate' })
  })

  test('processing outcome is recorded on the event row', async () => {
    const { db, store } = setup()
    const acquired = await acquireWebhookEvent(db, 'twilio', 'SM1', {})
    if (acquired.status !== 'acquired') throw new Error('expected acquired')

    await markWebhookProcessed(db, acquired.eventRowId, 'failed', 'unmapped_twilio_number')

    const row = store.webhook_events.rows?.[0]
    expect(row?.processing_status).toBe('failed')
    expect(row?.error_message).toBe('unmapped_twilio_number')
    expect(typeof row?.processed_at).toBe('string')
  })
})
