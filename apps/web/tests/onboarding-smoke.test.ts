import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type FakeDb } from './support/fake-supabase'
import { evaluateSmokeTest } from '@/app/onboarding/actions'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000b1'

function setup(tables: FakeDb) {
  const fake = createFakeSupabase(tables)
  return { supabase: fake.client as unknown as SupabaseClient }
}

describe('onboarding smoke test', () => {
  test('passes only when the org has a real business profile, active channel, and active agent', async () => {
    const { supabase } = setup({
      business_profiles: {
        rows: [{
          organization_id: ORG,
          business_id: BIZ,
          business_type_id: 'salon',
          timezone: 'UTC',
          activation_state: 'configuring',
        }],
      },
      channels: {
        rows: [{ id: 'chan-1', organization_id: ORG, business_id: BIZ, channel_type: 'whatsapp', is_active: true }],
      },
      ai_agents: {
        rows: [{ id: 'agent-1', organization_id: ORG, business_id: BIZ, status: 'active' }],
      },
    })

    const outcome = await evaluateSmokeTest(supabase, { organizationId: ORG })

    expect(outcome.passed).toBe(true)
    expect(outcome.status).toBe('passed')
    expect(outcome.checks.every((check) => check.ok)).toBe(true)
  })

  test('fails when an active channel or active agent is missing', async () => {
    const { supabase } = setup({
      business_profiles: {
        rows: [{
          organization_id: ORG,
          business_id: BIZ,
          business_type_id: 'salon',
          timezone: 'UTC',
          activation_state: 'configuring',
        }],
      },
      channels: {
        rows: [{ id: 'chan-1', organization_id: ORG, business_id: BIZ, channel_type: 'whatsapp', is_active: false }],
      },
      ai_agents: {
        rows: [{ id: 'agent-1', organization_id: ORG, business_id: BIZ, status: 'draft' }],
      },
    })

    const outcome = await evaluateSmokeTest(supabase, { organizationId: ORG })

    expect(outcome.passed).toBe(false)
    expect(outcome.status).toBe('failed')
    expect(outcome.checks.some((check) => !check.ok)).toBe(true)
  })
})
