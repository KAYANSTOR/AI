import { describe, expect, test } from 'bun:test'
import { drainOutbox } from '@/lib/channels/outbox-drain'
import { createFakeDb } from './support/fake-db'

const ORG = '0c000000-0000-4000-8000-000000000040'
const CHANNEL = '0c000000-0000-4000-8000-000000000041'

function staleAt() {
  return new Date(Date.now() - 10 * 60 * 1000).toISOString()
}

function world(overrides: Record<string, unknown>) {
  return createFakeDb({
    outbox_events: {
      rows: [{
        id: 'outbox-ops-1',
        organization_id: ORG,
        business_id: null,
        channel_id: CHANNEL,
        event_type: 'message.send',
        idempotency_key: 'qr:ops003:reply',
        recipient: '12025550111',
        payload: { body: 'synthetic reply' },
        status: 'processing',
        attempts: 1,
        locked_at: staleAt(),
        scheduled_at: staleAt(),
        created_at: staleAt(),
        ...overrides,
      }],
      unique: [['organization_id', 'idempotency_key']],
    },
    channels: {
      rows: [{
        id: CHANNEL,
        organization_id: ORG,
        business_id: null,
        channel_type: 'whatsapp',
        provider_account_id: '12025550110',
        external_identifier: '+12025550110',
        connection_mode: 'qr_unofficial',
        is_active: true,
      }],
    },
    audit_events: { rows: [] },
  })
}

/**
 * OPS-003 — after a provider call the acknowledgement write can fail. The stale row
 * must become `unconfirmed` for reconciliation, never be retried as a fresh send.
 */
describe('OPS-003 outbox uncertain delivery reconciliation', () => {
  test('a stale processing row with a started provider call becomes unconfirmed', async () => {
    const { client, store } = world({ provider_attempted_at: new Date().toISOString() })
    const result = await drainOutbox(client as never, { limit: 10 })

    expect(result.unconfirmed).toBe(1)
    expect(result.sent).toBe(0)
    expect(result.processed).toBe(0)
    expect(store.outbox_events.rows?.[0]?.status).toBe('unconfirmed')
    expect(store.outbox_events.rows?.[0]?.last_error).toBe('provider_outcome_unconfirmed')
    expect(store.audit_events.rows?.[0]?.action).toBe('outbox.delivery_unconfirmed')
  })

  test('a stale processing row that never reached the provider is retried, not marked unconfirmed', async () => {
    const { client, store } = world({ provider_attempted_at: null })
    const result = await drainOutbox(client as never, { limit: 10 })

    expect(result.unconfirmed).toBe(0)
    expect(result.retried).toBe(1)
    expect(store.outbox_events.rows?.[0]?.status).not.toBe('unconfirmed')
    expect(store.outbox_events.rows?.[0]?.provider_attempted_at).not.toBeNull()
  })
})
