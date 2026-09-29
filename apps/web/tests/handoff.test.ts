import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type FakeDb } from './support/fake-supabase'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { processInboundMessage } from '@/lib/runtime/process-inbound'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000b1'
const CONTACT = 'cccccccc-0000-4000-8000-000000000001'
const CHANNEL = 'dddddddd-0000-4000-8000-000000000001'
const PHONE = '+15550001'

/** The identity the runtime resolves for this sender on SMS. */
function seededContactTables(conversation: Record<string, unknown>): FakeDb {
  return {
    contacts: { rows: [{ id: CONTACT, organization_id: ORG, phone: PHONE, full_name: 'Customer' }] },
    contact_identities: {
      unique: [['contact_id', 'channel', 'external_user_id']],
      rows: [
        {
          contact_id: CONTACT,
          channel: 'sms',
          external_user_id: PHONE,
          contacts: { id: CONTACT, full_name: 'Customer', phone: PHONE, organization_id: ORG },
        },
      ],
    },
    conversations: {
      // Mirrors ux_conversation_open: uniqueness applies to open conversations only.
      unique: [{ columns: ['organization_id', 'contact_id', 'channel_id'], where: (row) => row.status !== 'closed' }],
      rows: [conversation],
    },
    messages: { unique: [['conversation_id', 'external_message_id']] },
    consents: { rows: [] },
    audit_events: { rows: [] },
    ai_agents: { rows: [] },
  }
}

function inbound(supabase: SupabaseClient) {
  return processInboundMessage(supabase, {
    organizationId: ORG,
    businessId: BIZ,
    channelId: CHANNEL,
    channelType: 'sms',
    provider: 'twilio',
    externalEventId: 'SM_' + Math.random(),
    externalUserId: PHONE,
    senderPhone: PHONE,
    text: 'مرحبا',
  })
}

describe('human handoff', () => {
  test('a handed-off conversation is reused, not replaced by a fresh AI-enabled one', async () => {
    const fake = createFakeSupabase(
      seededContactTables({
        id: 'conv-handoff',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'handed_off',
        state: 'human_handoff',
        ai_enabled: false,
        last_message_at: '2026-03-01T00:00:00.000Z',
      })
    )
    const supabase = fake.client as unknown as SupabaseClient

    const conversationId = await ensureOpenConversation(supabase, {
      organizationId: ORG,
      businessId: BIZ,
      contactId: CONTACT,
      channelId: CHANNEL,
    })

    expect(conversationId).toBe('conv-handoff')
    expect(fake.db.conversations.rows?.length).toBe(1)
  })

  test('the AI does not reply while a human controls the conversation', async () => {
    const fake = createFakeSupabase(
      seededContactTables({
        id: 'conv-handoff',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'handed_off',
        state: 'human_handoff',
        ai_enabled: false,
        last_message_at: '2026-03-01T00:00:00.000Z',
      })
    )
    const supabase = fake.client as unknown as SupabaseClient

    const result = await inbound(supabase)

    expect(result.reply).toBeNull()
    expect(result.conversationId).toBe('conv-handoff')
    // The customer's message is still recorded for the human to read.
    expect(fake.db.messages.rows?.length).toBe(1)
    expect(fake.db.messages.rows?.[0]?.direction).toBe('inbound')
    expect(fake.db.conversations.rows?.[0]?.ai_enabled).toBe(false)
  })

  test('a closed conversation does not block a new session', async () => {
    const fake = createFakeSupabase(
      seededContactTables({
        id: 'conv-closed',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'closed',
        state: 'closed',
        ai_enabled: false,
        last_message_at: '2026-02-01T00:00:00.000Z',
      })
    )
    const supabase = fake.client as unknown as SupabaseClient

    const conversationId = await ensureOpenConversation(supabase, {
      organizationId: ORG,
      businessId: BIZ,
      contactId: CONTACT,
      channelId: CHANNEL,
    })

    expect(conversationId).not.toBe('conv-closed')
    expect(fake.db.conversations.rows?.length).toBe(2)
  })

  test('a handoff never leaks to another organization conversation', async () => {
    const fake = createFakeSupabase({
      conversations: {
        unique: [{ columns: ['organization_id', 'contact_id', 'channel_id'], where: (row) => row.status !== 'closed' }],
        rows: [
          {
            id: 'conv-other-org',
            organization_id: 'other-org',
            contact_id: CONTACT,
            channel_id: CHANNEL,
            status: 'active',
            ai_enabled: true,
          },
        ],
      },
    })
    const supabase = fake.client as unknown as SupabaseClient

    const conversationId = await ensureOpenConversation(supabase, {
      organizationId: ORG,
      businessId: BIZ,
      contactId: CONTACT,
      channelId: CHANNEL,
    })

    expect(conversationId).not.toBe('conv-other-org')
  })
})

describe('customer opt-out', () => {
  test('explicit "stop" records consent and stops automation for that channel', async () => {
    const fake = createFakeSupabase(
      seededContactTables({
        id: 'conv-1',
        organization_id: ORG,
        contact_id: CONTACT,
        channel_id: CHANNEL,
        status: 'active',
        state: 'discovery',
        ai_enabled: true,
      })
    )
    const supabase = fake.client as unknown as SupabaseClient

    const result = await processInboundMessage(supabase, {
      organizationId: ORG,
      businessId: BIZ,
      channelId: CHANNEL,
      channelType: 'sms',
      provider: 'twilio',
      externalEventId: 'SM_optout',
      externalUserId: PHONE,
      senderPhone: PHONE,
      text: 'توقف',
    })

    expect(result.reply).toBeNull()
    expect(fake.db.consents.rows?.[0]?.status).toBe('opted_out')
    expect(fake.db.audit_events.rows?.[0]?.action).toBe('consent.opted_out')
  })

  test('an already opted-out contact is never answered again', async () => {
    const tables = seededContactTables({
      id: 'conv-1',
      organization_id: ORG,
      contact_id: CONTACT,
      channel_id: CHANNEL,
      status: 'active',
      state: 'discovery',
      ai_enabled: true,
    })
    tables.consents = {
      rows: [
        {
          contact_id: CONTACT,
          channel: 'sms',
          status: 'opted_out',
          captured_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    const fake = createFakeSupabase(tables)
    const supabase = fake.client as unknown as SupabaseClient

    const result = await processInboundMessage(supabase, {
      organizationId: ORG,
      businessId: BIZ,
      channelId: CHANNEL,
      channelType: 'sms',
      provider: 'twilio',
      externalEventId: 'SM_2',
      externalUserId: PHONE,
      senderPhone: PHONE,
      text: 'أريد موعدا',
    })

    expect(result.reply).toBeNull()
  })
})
