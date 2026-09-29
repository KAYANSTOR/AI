import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type FakeDb } from './support/fake-supabase'
import { resolveBusinessAgent, resolveChannelExact } from '@/lib/runtime/tenant'

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const BIZ_A = 'aaaaaaaa-0000-4000-8000-0000000000b1'
const BIZ_B = 'bbbbbbbb-0000-4000-8000-0000000000b2'

function setup(tables: FakeDb) {
  const fake = createFakeSupabase(tables)
  return { db: fake.db, supabase: fake.client as unknown as SupabaseClient }
}

function channel(overrides: Record<string, unknown>) {
  return {
    id: 'channel-' + String(overrides.provider_account_id ?? overrides.external_identifier ?? 'x'),
    organization_id: ORG_A,
    business_id: BIZ_A,
    channel_type: 'whatsapp',
    provider_account_id: null,
    external_identifier: null,
    is_active: true,
    ...overrides,
  }
}

describe('exact channel binding (ADR-0002)', () => {
  test('resolves the organization and business that own the binding', async () => {
    const { supabase } = setup({
      channels: { rows: [channel({ provider_account_id: 'pn_a', organization_id: ORG_A, business_id: BIZ_A })] },
    })

    const resolved = await resolveChannelExact(supabase, {
      channelType: 'whatsapp',
      providerAccountId: 'pn_a',
    })

    expect(resolved?.organizationId).toBe(ORG_A)
    expect(resolved?.businessId).toBe(BIZ_A)
    expect(resolved?.providerAccountId).toBe('pn_a')
  })

  test('an unknown identifier resolves to nothing and never to first-organization', async () => {
    const { supabase } = setup({
      channels: { rows: [channel({ provider_account_id: 'pn_a' })] },
    })

    expect(await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'pn_unknown' })).toBeNull()
    expect(await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: null })).toBeNull()
  })

  test('a disabled channel is rejected', async () => {
    const { supabase } = setup({
      channels: { rows: [channel({ provider_account_id: 'pn_off', is_active: false })] },
    })

    expect(await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'pn_off' })).toBeNull()
  })

  test('a channel without a business is rejected: runtime is business-specific', async () => {
    const { supabase } = setup({
      channels: { rows: [channel({ provider_account_id: 'pn_nobiz', business_id: null })] },
    })

    expect(await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'pn_nobiz' })).toBeNull()
  })

  test('channel_type is part of the key, so a same-shaped binding in another channel never matches', async () => {
    const { supabase } = setup({
      channels: {
        rows: [
          channel({ provider_account_id: 'shared_id', channel_type: 'phone' }),
          channel({ provider_account_id: 'shared_id', channel_type: 'whatsapp', organization_id: ORG_B, business_id: BIZ_B }),
        ],
      },
    })

    const resolved = await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'shared_id' })
    expect(resolved?.organizationId).toBe(ORG_B)
  })

  test('SMS resolves by the destination number (external_identifier)', async () => {
    const { supabase } = setup({
      channels: { rows: [channel({ channel_type: 'sms', external_identifier: '+15550002' })] },
    })

    const resolved = await resolveChannelExact(supabase, { channelType: 'sms', externalIdentifier: '+15550002' })
    expect(resolved?.organizationId).toBe(ORG_A)
    expect(await resolveChannelExact(supabase, { channelType: 'sms', externalIdentifier: '+15559999' })).toBeNull()
  })

  test('two organizations keep separate identities for the same provider number shape', async () => {
    const { supabase } = setup({
      channels: {
        rows: [
          channel({ provider_account_id: 'pn_1', organization_id: ORG_A, business_id: BIZ_A }),
          channel({ provider_account_id: 'pn_2', organization_id: ORG_B, business_id: BIZ_B }),
        ],
      },
    })

    expect((await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'pn_1' }))?.organizationId).toBe(ORG_A)
    expect((await resolveChannelExact(supabase, { channelType: 'whatsapp', providerAccountId: 'pn_2' }))?.organizationId).toBe(ORG_B)
  })
})

describe('business agent resolution', () => {
  test('returns the active agent for the business', async () => {
    const { supabase } = setup({
      business_profiles: {
        rows: [{ id: 'profile-a', organization_id: ORG_A, business_id: BIZ_A, activation_state: 'active' }],
      },
      ai_agents: {
        rows: [
          { id: 'agent-b', organization_id: ORG_A, business_id: BIZ_A, name: 'B', status: 'active', created_at: '2026-01-02T00:00:00Z' },
          { id: 'agent-a', organization_id: ORG_A, business_id: BIZ_A, name: 'A', status: 'active', created_at: '2026-01-01T00:00:00Z' },
        ],
      },
    })

    expect((await resolveBusinessAgent(supabase, BIZ_A))?.id).toBe('agent-a')
  })

  test('never returns a suspended agent', async () => {
    const { supabase } = setup({
      ai_agents: {
        rows: [{ id: 'agent-x', business_id: BIZ_A, status: 'suspended', created_at: '2026-01-01T00:00:00Z' }],
      },
    })

    expect(await resolveBusinessAgent(supabase, BIZ_A)).toBeNull()
  })

  test('never returns another business agent', async () => {
    const { supabase } = setup({
      ai_agents: {
        rows: [{ id: 'agent-b', business_id: BIZ_B, status: 'active', created_at: '2026-01-01T00:00:00Z' }],
      },
    })

    expect(await resolveBusinessAgent(supabase, BIZ_A)).toBeNull()
  })
})
