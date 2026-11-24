import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { syncOwnerWhatsAppMessage } from '@/lib/channels/whatsapp-owner-sync'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import {
  catchUpStillNeeded,
  isOwnerPauseActive,
  isUnansweredForCatchUp,
  normalizeSettings,
  runOwnerPresenceCatchUp,
} from '@/lib/runtime/owner-presence'
import { parseOwnerPresenceInput } from '@/lib/runtime/owner-presence-settings'
import { createFakeDb } from './support/fake-db'

const ORG = '22222222-2222-4222-8222-222222222222'
const BIZ = '33333333-3333-4333-8333-333333333333'
const CHANNEL = '11111111-1111-4111-8111-111111111111'
const PHONE_A = '967777000111' // the owner answers this customer himself
const PHONE_B = '967777000222' // nobody answers this customer
const MIN = 60_000

function contact(id: string, phone: string) {
  return { id, organization_id: ORG, phone, full_name: 'عميل ' + id }
}
function identity(id: string, phone: string) {
  return { contact_id: id, channel: 'whatsapp', external_user_id: phone, contacts: contact(id, phone) }
}
function conversation(id: string, contactId: string, extra: Record<string, unknown> = {}) {
  return {
    id, organization_id: ORG, business_id: BIZ, contact_id: contactId, channel_id: CHANNEL,
    status: 'open', state: 'new', ai_enabled: true, last_inbound_at: null, last_outbound_at: null, ...extra,
  }
}

function setup(t0: number, channelExtra: Record<string, unknown> = {}) {
  return createFakeDb({
    channels: { rows: [{
      id: CHANNEL, organization_id: ORG, business_id: BIZ, channel_type: 'whatsapp',
      connection_mode: 'qr_unofficial', is_active: true, provider_account_id: 'qr-session', external_identifier: '967700000000',
      ...channelExtra,
    }] },
    contacts: { rows: [contact('ca', PHONE_A), contact('cb', PHONE_B), contact('cc', '967777000333'), contact('cd', '967777000444')] },
    contact_identities: {
      unique: [['contact_id', 'channel', 'external_user_id']],
      rows: [identity('ca', PHONE_A), identity('cb', PHONE_B), identity('cc', '967777000333'), identity('cd', '967777000444')],
    },
    conversations: {
      unique: [{ columns: ['organization_id', 'contact_id', 'channel_id'], where: (row: Record<string, unknown>) => row.status !== 'closed' }],
      rows: [
        // Customer A wrote just before the owner started answering by hand.
        conversation('conv-a', 'ca', { last_inbound_at: new Date(t0 - MIN).toISOString() }),
        conversation('conv-b', 'cb'),
        // Unanswered but older than the 24h safety window.
        conversation('conv-c', 'cc', { last_inbound_at: new Date(t0 - 30 * 60 * MIN).toISOString() }),
        // Unanswered but escalated to a human.
        conversation('conv-d', 'cd', { status: 'handed_off', state: 'human_handoff', ai_enabled: false, last_inbound_at: new Date(t0).toISOString() }),
      ],
    },
    messages: {
      unique: [['conversation_id', 'external_message_id']],
      rows: [
        { id: 'm-a', organization_id: ORG, conversation_id: 'conv-a', direction: 'inbound', content: 'متى يصل الطلب؟', external_message_id: 'qr:a1', created_at: new Date(t0 - MIN).toISOString() },
        { id: 'm-c', organization_id: ORG, conversation_id: 'conv-c', direction: 'inbound', content: 'قديم', external_message_id: 'qr:c1', created_at: new Date(t0 - 30 * 60 * MIN).toISOString() },
      ],
    },
    consents: { rows: [] },
    audit_events: { rows: [] },
    ai_agents: { rows: [] },
    notifications: { rows: [] },
    outbox_events: { unique: [['idempotency_key']], rows: [] },
    business_profiles: { rows: [] },
    inbound_jobs: { unique: [['idempotency_key']], rows: [] },
  })
}

function ownerMessage(id: string, sentAt: number) {
  return {
    channelId: CHANNEL, externalEventId: `qr:${CHANNEL}:${id}`, providerMessageId: id,
    contactJid: PHONE_A + '@s.whatsapp.net', contactPhone: PHONE_A, text: 'أنا معك، الطلب في الطريق ' + id,
    sentAt: new Date(sentAt).toISOString(),
  }
}

describe('owner presence — sliding 30-minute pause', () => {
  test('a second manual owner message renews the pause for another 30 minutes', async () => {
    const t0 = Date.now() - 5 * MIN
    const fake = setup(t0)
    const db = fake.client as unknown as DbClient

    expect((await syncOwnerWhatsAppMessage(db, ownerMessage('o1', t0))).status).toBe('stored')
    const channel = () => fake.store.channels.rows![0]
    expect(channel().human_paused_until).toBe(new Date(t0 + 30 * MIN).toISOString())
    expect(channel().last_human_outbound_at).toBe(new Date(t0).toISOString())

    await syncOwnerWhatsAppMessage(db, ownerMessage('o2', t0 + 10 * MIN))
    expect(channel().human_paused_until).toBe(new Date(t0 + 40 * MIN).toISOString())
    expect(channel().last_human_outbound_at).toBe(new Date(t0 + 10 * MIN).toISOString())
    const convA = fake.store.conversations.rows!.find((row) => row.id === 'conv-a')!
    expect(convA.human_paused_until).toBe(new Date(t0 + 40 * MIN).toISOString())
    expect(convA.last_outbound_at).toBe(new Date(t0 + 10 * MIN).toISOString())
  })

  test('the agent does not reply during the pause, then catches up only the unanswered conversation', async () => {
    const t0 = Date.now() - 5 * MIN
    const fake = setup(t0)
    const db = fake.client as unknown as DbClient
    await syncOwnerWhatsAppMessage(db, ownerMessage('o1', t0))
    await syncOwnerWhatsAppMessage(db, ownerMessage('o2', t0 + 4 * MIN))

    // Customer B writes while the owner is active: stored, but no automatic reply.
    const inbound = await processInboundMessage(db, {
      organizationId: ORG, businessId: BIZ, channelId: CHANNEL, channelType: 'whatsapp', provider: 'whatsapp',
      externalEventId: 'qr:b1', externalUserId: PHONE_B, senderPhone: PHONE_B, text: 'عندكم توصيل لصنعاء؟',
    })
    expect(inbound.reply).toBeNull()
    expect(inbound.conversationId).toBe('conv-b')
    expect(fake.store.messages.rows!.some((row) => row.external_message_id === 'qr:b1' && row.direction === 'inbound')).toBe(true)
    expect(fake.store.outbox_events.rows!.length).toBe(0)
    expect(await isOwnerPauseActive(db, { channelId: CHANNEL, conversationId: 'conv-b' })).toBe(true)

    // Still inside the window: the sweep does nothing.
    const early = await runOwnerPresenceCatchUp(db, new Date(t0 + 20 * MIN))
    expect(early.queued).toBe(0)
    expect(fake.store.inbound_jobs.rows!.length).toBe(0)

    // 30 minutes after the last owner message: one job, for conv-b only.
    const after = new Date(t0 + 4 * MIN + 30 * MIN + 30_000)
    expect(await isOwnerPauseActive(db, { channelId: CHANNEL, conversationId: 'conv-b', now: after })).toBe(false)
    const result = await runOwnerPresenceCatchUp(db, after)
    expect(result.queued).toBe(1)
    const jobs = fake.store.inbound_jobs.rows!
    expect(jobs).toHaveLength(1)
    const payload = jobs[0].payload as Record<string, unknown>
    expect(payload.conversationId).toBe('conv-b')
    expect(payload.catchUp).toBe(true)
    expect(payload.text).toBe('عندكم توصيل لصنعاء؟')
    expect(payload.senderJid).toBe(PHONE_B)
    expect(payload.externalEventId).toBe('qr:b1')
    expect(jobs[0].status).toBe('queued')
    expect(String(jobs[0].idempotency_key)).toContain('owner-catchup:conv-b:')
    // conv-a (answered by the owner), conv-c (older than 24h) and conv-d (handoff) are skipped.
    expect(jobs.some((job) => (job.payload as Record<string, unknown>).conversationId === 'conv-a')).toBe(false)

    // The pause is cleared so the sweep does not repeat, and a rerun queues nothing.
    expect(fake.store.channels.rows![0].human_paused_until).toBeNull()
    expect((await runOwnerPresenceCatchUp(db, new Date(after.getTime() + MIN))).queued).toBe(0)
    expect(fake.store.inbound_jobs.rows!).toHaveLength(1)

    // If the owner answers B before the job runs, the job is dropped.
    expect(await catchUpStillNeeded(db, 'conv-b', after)).toBe(true)
    await syncOwnerWhatsAppMessage(db, { ...ownerMessage('o3', after.getTime() + 10_000), contactJid: PHONE_B + '@s.whatsapp.net', contactPhone: PHONE_B })
    expect(await catchUpStillNeeded(db, 'conv-b', new Date(after.getTime() + 20_000))).toBe(false)
  })

  test('conversation scope pauses only the conversation the owner answered', async () => {
    const t0 = Date.now() - 2 * MIN
    const fake = setup(t0, { human_takeover_scope: 'conversation' })
    const db = fake.client as unknown as DbClient
    await syncOwnerWhatsAppMessage(db, ownerMessage('o1', t0))
    expect(fake.store.channels.rows![0].human_paused_until ?? null).toBeNull()
    expect(await isOwnerPauseActive(db, { channelId: CHANNEL, conversationId: 'conv-a' })).toBe(true)
    expect(await isOwnerPauseActive(db, { channelId: CHANNEL, conversationId: 'conv-b' })).toBe(false)
  })

  test('disabled feature never pauses the agent', async () => {
    const t0 = Date.now() - MIN
    const fake = setup(t0, { human_takeover_enabled: false })
    const db = fake.client as unknown as DbClient
    await syncOwnerWhatsAppMessage(db, ownerMessage('o1', t0))
    expect(await isOwnerPauseActive(db, { channelId: CHANNEL, conversationId: 'conv-a' })).toBe(false)
    expect(fake.store.channels.rows![0].last_human_outbound_at).toBe(new Date(t0).toISOString())
  })

  test('settings defaults, validation and unanswered rule', () => {
    expect(normalizeSettings(null)).toEqual({ enabled: true, pauseMinutes: 30, scope: 'channel' })
    expect(normalizeSettings({ human_takeover_pause_minutes: 5000 }).pauseMinutes).toBe(30)
    expect(parseOwnerPresenceInput({ channelId: CHANNEL, enabled: true, pauseMinutes: 45, scope: 'conversation' }))
      .toEqual({ ok: true, value: { channelId: CHANNEL, enabled: true, pauseMinutes: 45, scope: 'conversation' } })
    expect(parseOwnerPresenceInput({ channelId: CHANNEL, enabled: true, pauseMinutes: 0, scope: 'channel' }).ok).toBe(false)
    const now = new Date('2026-11-24T12:00:00.000Z')
    const row = conversation('x', 'cb', { last_inbound_at: '2026-11-24T11:00:00.000Z', last_outbound_at: '2026-11-24T10:00:00.000Z' }) as Parameters<typeof isUnansweredForCatchUp>[0]
    expect(isUnansweredForCatchUp(row, now)).toBe(true)
    expect(isUnansweredForCatchUp({ ...row, last_outbound_at: '2026-11-24T11:30:00.000Z' }, now)).toBe(false)
    expect(isUnansweredForCatchUp({ ...row, status: 'handed_off' }, now)).toBe(false)
    expect(isUnansweredForCatchUp({ ...row, last_inbound_at: '2026-11-23T10:00:00.000Z', last_outbound_at: null }, now)).toBe(false)
  })
})
