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

  test('the at-risk band is sized from the deadline own window, not a fixed default', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    // 24h resolution window, 0.75 ratio: the last 6 hours are at risk. Five hours out is
    // inside the band, twenty hours out is not.
    const near = computeDueAt(now, 5 * 60)
    const far = computeDueAt(now, 20 * 60)

    expect(evaluateSlaState({ now, resolutionDueAt: near, resolutionMinutes: 1440 })).toBe('at_risk')
    expect(evaluateSlaState({ now, resolutionDueAt: far, resolutionMinutes: 1440 })).toBe('normal')
  })

  test('a short first-response window warns in minutes, not in the resolution band', () => {
    const now = new Date('2026-01-01T00:00:00Z')

    // 3 minutes left of a 15-minute window (band = 3.75 minutes) is at risk.
    expect(
      evaluateSlaState({ now, firstResponseDueAt: computeDueAt(now, 3), firstResponseMinutes: 15 })
    ).toBe('at_risk')
    // 10 minutes left of the same window is not.
    expect(
      evaluateSlaState({ now, firstResponseDueAt: computeDueAt(now, 10), firstResponseMinutes: 15 })
    ).toBe('normal')
  })

  test('the nearest deadline decides the state', () => {
    const now = new Date('2026-01-01T00:00:00Z')

    expect(
      evaluateSlaState({
        now,
        firstResponseDueAt: computeDueAt(now, 2),
        resolutionDueAt: computeDueAt(now, 1200),
        firstResponseMinutes: 15,
        resolutionMinutes: 1440,
      })
    ).toBe('at_risk')

    // Once the first response has happened its deadline no longer counts.
    expect(
      evaluateSlaState({
        now,
        firstResponseDueAt: computeDueAt(now, -5),
        resolutionDueAt: computeDueAt(now, 1200),
        firstRespondedAt: '2026-01-01T00:01:00Z',
        firstResponseMinutes: 15,
        resolutionMinutes: 1440,
      })
    ).toBe('normal')
  })

  test('warningRatio is the elapsed share of the window; its boundaries are inclusive', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const dueAt = computeDueAt(now, 600)

    // 0 means "warn from the moment the deadline is armed", so the whole window is at risk.
    expect(evaluateSlaState({ now, resolutionDueAt: dueAt, resolutionMinutes: 1440, warningRatio: 0 })).toBe(
      'at_risk'
    )
    // 1 means "never warn early": only the breach itself is reported.
    expect(evaluateSlaState({ now, resolutionDueAt: dueAt, resolutionMinutes: 1440, warningRatio: 1 })).toBe(
      'normal'
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
