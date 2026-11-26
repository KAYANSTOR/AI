import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { resolveTelegramEventId, telegramUpdateId } from '../src/lib/providers/telegram'
import { createFakeDb } from './support/fake-db'

const updateId = 123456
const scope = { channelId: 'channel-a', organizationId: 'org-a', botId: '101' }
const other = { channelId: 'channel-b', organizationId: 'org-b', botId: '202' }
const legacy = createHash('sha256').update(`telegram:${updateId}`).digest('hex')
const scoped = telegramUpdateId(updateId, scope.channelId, scope.botId)

function fixture(rows: Record<string, unknown>[] = []): DbClient {
  return createFakeDb({ webhook_events: { rows } }).client as unknown as DbClient
}

describe('Telegram provider identity', () => {
  test('retries of the same bot and channel have the same key', () => {
    expect(telegramUpdateId(updateId, scope.channelId, scope.botId)).toBe(scoped)
    expect(/^[a-f0-9]{64}$/.test(scoped)).toBe(true)
    expect(telegramUpdateId(updateId + 1, scope.channelId, scope.botId)).not.toBe(scoped)
  })
  test('same update number in a different bot or channel has a distinct key', () => {
    expect(telegramUpdateId(updateId, other.channelId, other.botId)).not.toBe(scoped)
    expect(telegramUpdateId(updateId, scope.channelId, other.botId)).not.toBe(scoped)
    expect(telegramUpdateId(updateId, other.channelId, scope.botId)).not.toBe(scoped)
  })
  test('new events always use their scoped identity', async () => {
    expect(await resolveTelegramEventId(fixture(), updateId, scope)).toBe(scoped)
    expect(await resolveTelegramEventId(fixture(), updateId, other)).not.toBe(scoped)
  })
  test('preserves a legacy event retry only for the recorded owning channel and organization', async () => {
    const db = fixture([{ id: 'event-a', provider: 'telegram', external_event_id: legacy, channel_id: scope.channelId, organization_id: scope.organizationId }])
    expect(await resolveTelegramEventId(db, updateId, scope)).toBe(legacy)
    expect(await resolveTelegramEventId(db, updateId, other)).toBe(telegramUpdateId(updateId, other.channelId, other.botId))
    expect(await resolveTelegramEventId(db, updateId, { ...scope, organizationId: other.organizationId })).toBe(scoped)
  })
  test('does not trust a legacy event without a tenant binding', async () => {
    const db = fixture([{ id: 'unbound', provider: 'telegram', external_event_id: legacy, channel_id: null, organization_id: null }])
    expect(await resolveTelegramEventId(db, updateId, scope)).toBe(scoped)
  })
  test('does not reuse a legacy event from another provider', async () => {
    const db = fixture([{ id: 'other-provider', provider: 'meta', external_event_id: legacy, channel_id: scope.channelId, organization_id: scope.organizationId }])
    expect(await resolveTelegramEventId(db, updateId, scope)).toBe(scoped)
  })
})
