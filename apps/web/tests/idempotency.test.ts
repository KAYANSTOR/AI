import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { createFakeDb } from './support/fake-db'

function setup() {
  const fake = createFakeDb(
    { webhook_events: { unique: [['provider', 'external_event_id']] } },
    {
      claim_webhook_event: (args) => {
        const provider = String(args.p_provider)
        const externalId = String(args.p_external_event_id)
        const rows = fake.store.webhook_events.rows ?? []
        let row = rows.find((item) => item.provider === provider && item.external_event_id === externalId)
        const now = new Date()
        if (!row) {
          row = {
            id: 'event-' + String(rows.length + 1),
            provider,
            external_event_id: externalId,
            payload: args.p_payload,
            processing_status: 'processing',
            attempt_count: 1,
            processing_started_at: now.toISOString(),
            received_at: now.toISOString(),
          }
          rows.push(row)
          return [{ event_row_id: row.id, claimed: true, current_status: 'processing' }]
        }

        const staleAt = new Date(now.getTime() - 5 * 60 * 1000)
        const processingAt = new Date(String(row.processing_started_at ?? row.received_at))
        const reclaimable =
          row.processing_status === 'pending' ||
          row.processing_status === 'failed' ||
          (row.processing_status === 'processing' && processingAt <= staleAt)

        if (reclaimable) {
          row.processing_status = 'processing'
          row.attempt_count = Number(row.attempt_count ?? 0) + 1
          row.processing_started_at = now.toISOString()
          row.processed_at = null
          row.error_message = null
          row.payload = args.p_payload
          return [{ event_row_id: row.id, claimed: true, current_status: 'processing' }]
        }

        return [{ event_row_id: row.id, claimed: false, current_status: row.processing_status }]
      },
    }
  )

  return { store: fake.store, db: fake.client as unknown as DbClient }
}

describe('atomic webhook idempotency', () => {
  test('the first delivery acquires and marks the event as processing', async () => {
    const { db, store } = setup()
    const result = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(result.status).toBe('acquired')
    expect(store.webhook_events.rows?.[0]?.processing_status).toBe('processing')
    expect(store.webhook_events.rows?.[0]?.attempt_count).toBe(1)
  })

  test('a concurrent redelivery cannot acquire an event already being processed', async () => {
    const { db, store } = setup()
    await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })
    const duplicate = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(duplicate.status).toBe('duplicate')
    expect(store.webhook_events.rows?.length).toBe(1)
    expect(store.webhook_events.rows?.[0]?.attempt_count).toBe(1)
  })

  test('a failed event can be claimed again instead of being permanently discarded', async () => {
    const { db, store } = setup()
    const first = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })
    if (first.status !== 'acquired') throw new Error('expected first claim')

    await markWebhookProcessed(db, first.eventRowId, 'failed', 'model_unavailable')
    const retry = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(retry.status).toBe('acquired')
    expect(store.webhook_events.rows?.[0]?.processing_status).toBe('processing')
    expect(store.webhook_events.rows?.[0]?.attempt_count).toBe(2)
    expect(store.webhook_events.rows?.[0]?.error_message).toBeNull()
  })

  test('a processed event remains a duplicate', async () => {
    const { db } = setup()
    const first = await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })
    if (first.status !== 'acquired') throw new Error('expected first claim')

    await markWebhookProcessed(db, first.eventRowId, 'processed')
    expect((await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', { text: 'hi' })).status).toBe('duplicate')
  })

  test('the same provider event id on a different provider is a different event', async () => {
    const { db } = setup()
    expect((await acquireWebhookEvent(db, 'whatsapp', 'shared-id', {})).status).toBe('acquired')
    expect((await acquireWebhookEvent(db, 'instagram', 'shared-id', {})).status).toBe('acquired')
  })

  test('a stale processing lock can be recovered after a worker crash', async () => {
    const { db, store } = setup()
    await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', {})
    const row = store.webhook_events.rows?.[0]
    if (!row) throw new Error('event missing')
    row.processing_started_at = '2000-01-01T00:00:00.000Z'

    expect((await acquireWebhookEvent(db, 'whatsapp', 'wamid.1', {})).status).toBe('acquired')
    expect(row.attempt_count).toBe(2)
  })
})
