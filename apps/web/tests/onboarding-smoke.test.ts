import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type FakeDb } from './support/fake-supabase'
import { evaluateSmokeTest, withReplyTestCheck } from '@/lib/onboarding/smoke-test'

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
        rows: [
          {
            id: 'chan-1',
            organization_id: ORG,
            business_id: BIZ,
            channel_type: 'whatsapp',
            is_active: true,
            verification_status: 'verified',
          },
        ],
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
        rows: [
          {
            id: 'chan-1',
            organization_id: ORG,
            business_id: BIZ,
            channel_type: 'whatsapp',
            is_active: false,
            verification_status: 'verified',
          },
        ],
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

  test('an enabled but unverified channel is not enough to go live', async () => {
    // FastPath: one intended channel is enough to start, but it must have completed
    // provider verification. Otherwise activation would promise a channel that cannot
    // deliver a customer message.
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
        rows: [
          {
            id: 'chan-1',
            organization_id: ORG,
            business_id: BIZ,
            channel_type: 'whatsapp',
            is_active: true,
            verification_status: 'pending',
          },
        ],
      },
      ai_agents: {
        rows: [{ id: 'agent-1', organization_id: ORG, business_id: BIZ, status: 'active' }],
      },
    })

    const outcome = await evaluateSmokeTest(supabase, { organizationId: ORG })

    expect(outcome.passed).toBe(false)
    expect(outcome.checks.find((check) => check.name === 'verified_channel')?.ok).toBe(false)
  })

  test('a real answered reply is required while failed and skipped replies fail the stable check', async () => {
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
        rows: [{
          id: 'chan-1',
          organization_id: ORG,
          business_id: BIZ,
          channel_type: 'whatsapp',
          is_active: true,
          verification_status: 'verified',
        }],
      },
      ai_agents: {
        rows: [{ id: 'agent-1', organization_id: ORG, business_id: BIZ, status: 'active' }],
      },
    })
    const structuralOutcome = await evaluateSmokeTest(supabase, { organizationId: ORG })

    const answered = withReplyTestCheck(structuralOutcome, 'answered')
    expect(answered.passed).toBe(true)
    const replyCheck = answered.checks.find((check) => check.name === 'reply_test')
    expect(replyCheck?.ok).toBe(true)
    expect(replyCheck?.message).toBe('تم اختبار رد المساعد بنجاح.')

    for (const status of ['failed', 'skipped'] as const) {
      const rejected = withReplyTestCheck(structuralOutcome, status)
      expect(rejected.passed).toBe(false)
      expect(rejected.status).toBe('failed')
      expect(rejected.checks.find((check) => check.name === 'reply_test')?.ok).toBe(false)
    }
  })

  test('channel and agent readiness must belong to the profile business', async () => {
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
        rows: [{
          id: 'other-channel',
          organization_id: ORG,
          business_id: 'aaaaaaaa-0000-4000-8000-0000000000b2',
          is_active: true,
          verification_status: 'verified',
        }],
      },
      ai_agents: {
        rows: [{
          id: 'other-agent',
          organization_id: ORG,
          business_id: 'aaaaaaaa-0000-4000-8000-0000000000b2',
          status: 'active',
        }],
      },
    })

    const outcome = await evaluateSmokeTest(supabase, { organizationId: ORG })

    expect(outcome.passed).toBe(false)
    expect(outcome.checks.find((check) => check.name === 'verified_channel')?.ok).toBe(false)
    expect(outcome.checks.find((check) => check.name === 'active_agent')?.ok).toBe(false)
  })
})
