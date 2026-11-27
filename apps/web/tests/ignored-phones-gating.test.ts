import { afterEach, describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb, type FakeDb } from './support/fake-db'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { setAgentTurnRunner, setPersonalTurnRunner } from '@/lib/runtime/process-inbound'

const ORG = 'aaaaaaaa-0000-4000-8000-00000000000f'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000bf'
const CONTACT = 'cccccccc-0000-4000-8000-00000000000f'
const CHANNEL = 'dddddddd-0000-4000-8000-00000000000f'
// Test numbers only (555-01xx range is reserved for fictional use).
const NORMAL_PHONE = '+12025550101'
const IGNORED_PHONE = '+12025550102'

function baseTables(ignored: string[], conversation: Record<string, unknown>): FakeDb {
  return {
    organizations: { rows: [{ id: ORG, ignored_phones: ignored }] },
    business_profiles: { rows: [{ organization_id: ORG, business_id: BIZ, activation_state: 'active' }] },
    subscriptions: { rows: [{ organization_id: ORG, status: 'active', plan_tier: 'starter' }] },
    contacts: { rows: [{ id: CONTACT, organization_id: ORG, phone: NORMAL_PHONE, full_name: 'Customer' }] },
    contact_identities: {
      unique: [['contact_id', 'channel', 'external_user_id']],
      rows: [
        {
          contact_id: CONTACT,
          channel: 'whatsapp',
          external_user_id: NORMAL_PHONE,
          contacts: { id: CONTACT, full_name: 'Customer', phone: NORMAL_PHONE, organization_id: ORG },
        },
      ],
    },
    conversations: {
      unique: [{ columns: ['organization_id', 'contact_id', 'channel_id'], where: (row) => row.status !== 'closed' }],
      rows: [conversation],
    },
    messages: { unique: [['conversation_id', 'external_message_id']] },
    consents: { rows: [] },
    audit_events: { rows: [] },
    ai_agents: { rows: [] },
    organization_members: { rows: [] },
    users: { rows: [] },
    personal_assistant_settings: { rows: [] },
  }
}

function inbound(db: DbClient, phone: string) {
  return processInboundMessage(db, {
    organizationId: ORG,
    businessId: BIZ,
    channelId: CHANNEL,
    channelType: 'whatsapp',
    provider: 'meta',
    externalEventId: 'wamid.F_' + Math.random(),
    externalUserId: phone,
    senderPhone: phone,
    text: 'مرحبا، أريد حجز موعد',
  })
}

describe('F-003 ignored_phones gating', () => {
  afterEach(() => { setAgentTurnRunner(null); setPersonalTurnRunner(null) })
  test('a phone on ignored_phones creates no business records and gets no commercial reply', async () => {
    const fake = createFakeDb(
      baseTables([IGNORED_PHONE], {
        id: 'conv-ignored',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'active',
        state: 'discovery',
        ai_enabled: true,
      })
    )
    const db = fake.client as unknown as DbClient

    const result = await inbound(db, IGNORED_PHONE)

    expect(result.reply).toBeNull()
    // No business trace at all: no contact created, no message stored, no SLA armed.
    expect(fake.store.messages.rows?.length ?? 0).toBe(0)
    expect(fake.store.conversations.rows?.[0]?.first_response_due_at ?? null).toBeNull()
  })

  test('the owner message goes to the personal assistant without touching business records or SLA', async () => {
    const OWNER_PHONE = '+12025550103'
    const USER = 'bbbbbbbb-0000-4000-8000-00000000000f'
    const fake = createFakeDb(
      baseTables([], {
        id: 'conv-owner',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'active',
        state: 'discovery',
        ai_enabled: true,
      })
    )
    const store = fake.store as unknown as Record<string, { rows?: Record<string, unknown>[] }>
    store.organization_members = { rows: [{ organization_id: ORG, user_id: USER, role: 'owner' }] }
    store.personal_assistant_links = { rows: [{ org_id: ORG, user_id: USER, whatsapp_phone: OWNER_PHONE, verified_at: '2026-01-01T00:00:00Z', kill_switch_active: false }] }
    setPersonalTurnRunner(async (_db, owner) => {
      expect(owner).toEqual({ organizationId: ORG, userId: USER })
      return { reply: 'مرحباً بك في المساعد الشخصي', inputTokens: 0, outputTokens: 0, model: 'test-model' }
    })
    const db = fake.client as unknown as DbClient

    const result = await inbound(db, OWNER_PHONE)

    // The personal assistant answered; nothing commercial was created.
    expect(result.reply).toBe('مرحباً بك في المساعد الشخصي')
    expect(result.conversationId).toBe('')
    expect(result.contactId).toBe('')
    expect(store.contacts?.rows).toHaveLength(1)
    expect(store.conversations?.rows).toHaveLength(1)
    expect(store.messages?.rows?.length ?? 0).toBe(0)
    expect(store.conversations?.rows?.[0]?.first_response_due_at ?? null).toBeNull()
  })

  test('a normal customer completes the commercial path untouched', async () => {
    const fake = createFakeDb(
      baseTables([], {
        id: 'conv-normal',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'active',
        state: 'discovery',
        ai_enabled: true,
      })
    )
    const store = fake.store as unknown as Record<string, { rows?: Record<string, unknown>[] }>
    store.ai_agents = { rows: [{ id: 'agent-1', organization_id: ORG, business_id: BIZ, status: 'active' }] }
    setAgentTurnRunner(() => Promise.resolve('أهلاً بك! كيف أساعدك؟'))
    const db = fake.client as unknown as DbClient

    const result = await inbound(db, NORMAL_PHONE)

    expect(result.reply).toBe('أهلاً بك! كيف أساعدك؟')
    expect(fake.store.messages.rows?.length).toBe(1)
    expect(fake.store.conversations.rows?.[0]?.first_response_due_at ?? null).not.toBeNull()
    setAgentTurnRunner(null)
  })
})
