import { describe, expect, test } from 'bun:test'
import { canTransitionLead, isLeadStatus } from '@/lib/leads'
import { evaluateSlaState, computeDueAt, DEFAULT_SLA_POLICY } from '@/lib/sla'
import { assertMarketingAllowed, ConsentBlockedError } from '@/lib/channels/consent'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'

describe('lead transitions', () => {
  test('allows legal pipeline moves and rejects illegal ones', () => {
    expect(isLeadStatus('qualified')).toBe(true)
    expect(canTransitionLead('new', 'qualified')).toBe(true)
    expect(canTransitionLead('won', 'lost')).toBe(false)
    expect(canTransitionLead('lost', 'recovered')).toBe(true)
  })
})

describe('SLA evaluation', () => {
  test('marks breached after due and resolved when closed', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    const due = computeDueAt(new Date('2026-01-01T11:00:00Z'), 15)

    expect(
      evaluateSlaState({
        now,
        firstResponseDueAt: due,
        firstRespondedAt: null,
      })
    ).toBe('breached')

    expect(
      evaluateSlaState({
        now,
        firstResponseDueAt: due,
        firstRespondedAt: '2026-01-01T11:05:00Z',
        resolvedAt: '2026-01-01T11:30:00Z',
      })
    ).toBe('resolved')
  })

  test('default policy has positive windows', () => {
    expect(DEFAULT_SLA_POLICY.firstResponseMinutes).toBeGreaterThan(0)
    expect(DEFAULT_SLA_POLICY.resolutionMinutes).toBeGreaterThan(
      DEFAULT_SLA_POLICY.firstResponseMinutes
    )
  })
})

describe('marketing consent guard', () => {
  test('blocks opted-out contacts', async () => {
    const fake = createFakeSupabase({
      consents: {
        rows: [
          {
            contact_id: 'c1',
            channel: 'whatsapp',
            status: 'opted_out',
            captured_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })

    await expect(
      assertMarketingAllowed(fake.client as unknown as SupabaseClient, {
        contactId: 'c1',
        channel: 'whatsapp',
      })
    ).rejects.toBeInstanceOf(ConsentBlockedError)
  })
})
