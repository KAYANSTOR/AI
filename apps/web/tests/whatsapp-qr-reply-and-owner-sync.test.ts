import { describe, expect, test } from 'bun:test'
import { decodeContactsCursor, encodeContactsCursor, parseContactsLimit } from '../src/lib/api/contacts-pagination'
import { likePattern, parseInboxPage } from '../src/lib/inbox/search'
import { decodeMessageCursor, encodeMessageCursor } from '../src/lib/inbox/messages'
import type { DbClient } from '@/lib/db/client'
import { claimOutboundEvent } from '@/lib/channels/outbox'
import { parseOwnerWhatsAppMessage, syncOwnerWhatsAppMessage } from '@/lib/channels/whatsapp-owner-sync'
import { classifyUpsertMessage, createSentMessageRegistry } from '../../whatsapp-gateway/src/message-direction.js'
import { createFakeDb } from './support/fake-db'

const CHANNEL = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const BUSINESS = '33333333-3333-4333-8333-333333333333'

const baseArgs = {
  organizationId: ORG,
  businessId: BUSINESS,
  channelId: CHANNEL,
  eventType: 'message.send',
  idempotencyKey: 'qr:evt-1:reply',
  recipient: '967777000111',
  payload: { body: 'hello', conversation_id: 'conversation-1' },
}

describe('atomic outbound reservation', () => {
  function reserveRpc(store: { rows?: Record<string, unknown>[] }) {
    return () => {
      const row = { id: 'outbox-1', status: 'pending', attempts: 0, scheduled_at: '2000-01-01T00:00:00.000Z', organization_id: ORG, idempotency_key: baseArgs.idempotencyKey }
      store.rows = [row]
      return [{ event_id: row.id, status: row.status, attempts: row.attempts, scheduled_at: row.scheduled_at }]
    }
  }

  test('a freshly reserved pending row is locked before the inline send', async () => {
    const tables = { outbox_events: { rows: [] as Record<string, unknown>[] } }
    const fake = createFakeDb(tables, {})
    const db = { ...fake.client, rpc: async () => ({ data: reserveRpc(fake.store.outbox_events)(), error: null }) }
    const result = await claimOutboundEvent(db as unknown as DbClient, baseArgs)
    expect(result).toEqual({ status: 'claimed', eventId: 'outbox-1', attempts: 1 })
    expect(fake.store.outbox_events.rows?.[0]?.status).toBe('processing')
  })

  test('reserve-only callers leave the intent pending for the outbox drain', async () => {
    const fake = createFakeDb({ outbox_events: { rows: [] } }, {})
    const db = { ...fake.client, rpc: async () => ({ data: reserveRpc(fake.store.outbox_events)(), error: null }) }
    const result = await claimOutboundEvent(db as unknown as DbClient, { ...baseArgs, reserveOnly: true })
    expect(result).toEqual({ status: 'queued' })
    expect(fake.store.outbox_events.rows?.[0]?.status).toBe('pending')
  })
})

describe('WhatsApp QR upsert classification', () => {
  const now = Date.parse('2026-11-24T10:00:00.000Z')
  const message = (fromMe: boolean, id = 'MSG1', seconds = now / 1000) => ({
    key: { remoteJid: '967777000111@s.whatsapp.net', id, fromMe },
    messageTimestamp: seconds,
  })

  test('customer messages are forwarded to the AI pipeline', () => {
    expect(classifyUpsertMessage(message(false), 'notify', { now })).toEqual({ kind: 'customer' })
  })

  test('the bot echo of its own reply is ignored so it never loops', () => {
    const registry = createSentMessageRegistry({ now: () => now })
    registry.add(CHANNEL, 'BOT1')
    const decision = classifyUpsertMessage(message(true, 'BOT1'), 'append', { now, isBotSent: (id: string) => registry.has(CHANNEL, id) })
    expect(decision).toEqual({ kind: 'ignore', reason: 'bot_echo' })
  })

  test('a manual owner message from the phone is synced as outbound', () => {
    const registry = createSentMessageRegistry({ now: () => now })
    expect(classifyUpsertMessage(message(true, 'PHONE1'), 'notify', { now, isBotSent: (id: string) => registry.has(CHANNEL, id) }))
      .toEqual({ kind: 'owner_manual' })
  })

  test('old history replays and groups are ignored', () => {
    expect(classifyUpsertMessage(message(true, 'OLD', now / 1000 - 3600), 'append', { now }).kind).toBe('ignore')
    expect(classifyUpsertMessage({ key: { remoteJid: '123@g.us', id: 'G', fromMe: false } }, 'notify', { now }).kind).toBe('ignore')
    expect(classifyUpsertMessage(message(false), 'append', { now }).kind).toBe('ignore')
  })

  test('sent message registry entries expire', () => {
    let clock = now
    const registry = createSentMessageRegistry({ ttlMs: 1000, now: () => clock })
    registry.add(CHANNEL, 'X')
    expect(registry.has(CHANNEL, 'X')).toBe(true)
    clock += 2000
    expect(registry.has(CHANNEL, 'X')).toBe(false)
  })
})

describe('owner WhatsApp message sync', () => {
  const payload = {
    channelId: CHANNEL,
    externalEventId: 'qr:' + CHANNEL + ':PHONE1',
    providerMessageId: 'PHONE1',
    direction: 'outbound',
    senderType: 'human_whatsapp',
    contactJid: '967777000111@s.whatsapp.net',
    contactPhone: '967777000111',
    text: 'أهلاً، سأتواصل معك الآن',
    sentAt: '2026-11-24T10:00:00.000Z',
  }

  test('rejects payloads that are not explicit human outbound messages', () => {
    expect(parseOwnerWhatsAppMessage({ ...payload, direction: 'inbound' })).toBeNull()
    expect(parseOwnerWhatsAppMessage({ ...payload, senderType: 'ai' })).toBeNull()
    expect(parseOwnerWhatsAppMessage(payload)?.contactPhone).toBe('967777000111')
  })

  test('stores the message as outbound/human_whatsapp in the open conversation without queuing AI work', async () => {
    const fake = createFakeDb({
      channels: { rows: [{ id: CHANNEL, organization_id: ORG, business_id: BUSINESS, channel_type: 'whatsapp', connection_mode: 'qr_unofficial', is_active: true }] },
      contacts: { rows: [{ id: 'contact-1', organization_id: ORG, phone: '967777000111', full_name: 'عميل' }] },
      contact_identities: { rows: [] },
      conversations: { rows: [{ id: 'conv-1', organization_id: ORG, contact_id: 'contact-1', channel_id: CHANNEL, status: 'active' }] },
      messages: { rows: [], unique: [['conversation_id', 'external_message_id']] },
      inbound_jobs: { rows: [] },
    })
    const db = fake.client as unknown as DbClient
    const input = parseOwnerWhatsAppMessage(payload)!
    expect(await syncOwnerWhatsAppMessage(db, input)).toEqual({ status: 'stored', conversationId: 'conv-1' })
    const stored = fake.store.messages.rows?.[0]
    expect(stored?.direction).toBe('outbound')
    expect(stored?.sender_type).toBe('human_whatsapp')
    expect(fake.store.inbound_jobs.rows?.length).toBe(0)
    expect((await syncOwnerWhatsAppMessage(db, input)).status).toBe('duplicate')
    expect(fake.store.messages.rows?.length).toBe(1)
  })
})

describe('pagination helpers', () => {
  test('contacts limit is capped and cursor round-trips', () => {
    expect(parseContactsLimit(null)).toBe(50)
    expect(parseContactsLimit('5000')).toBe(100)
    expect(parseContactsLimit('-3')).toBe(50)
    const row = { created_at: '2026-11-20T10:00:00.000Z', id: '0f8fad5b-d9cb-469f-a165-70867728950e' }
    expect(decodeContactsCursor(encodeContactsCursor(row))).toEqual({ createdAt: row.created_at, id: row.id })
    expect(decodeContactsCursor('not-a-cursor')).toBeNull()
    expect(decodeContactsCursor(encodeContactsCursor({ created_at: '2026-11-20T10:00:00.123456+00:00', id: row.id }))?.createdAt).toBe('2026-11-20T10:00:00.123456+00:00')
    expect(decodeContactsCursor(Buffer.from("x|1'),drop").toString('base64url'))).toBeNull()
  })

  test('message cursor and inbox search inputs are sanitized', () => {
    const cursor = encodeMessageCursor({ createdAt: '2026-11-20T10:00:00.000Z', id: '0f8fad5b-d9cb-469f-a165-70867728950e' })
    expect(decodeMessageCursor(cursor)?.id).toBe('0f8fad5b-d9cb-469f-a165-70867728950e')
    expect(decodeMessageCursor('bad|cursor')).toBeNull()
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%')
    expect(parseInboxPage('abc')).toBe(1)
    expect(parseInboxPage('3')).toBe(3)
  })
})
