import { describe, expect, test } from 'bun:test'
import { addOneCalendarMonth, isTrialExpired } from '@/lib/billing/trial-period'

describe('trial period', () => {
  test('adds one calendar month and preserves the time', () => {
    expect(addOneCalendarMonth(new Date('2026-01-15T12:30:00.000Z')).toISOString()).toBe(
      '2026-02-15T12:30:00.000Z'
    )
  })

  test('clamps month-end dates instead of spilling into a second month', () => {
    expect(addOneCalendarMonth(new Date('2026-01-31T08:00:00.000Z')).toISOString()).toBe(
      '2026-02-28T08:00:00.000Z'
    )
  })

  test('expires a trial at its exact end and preserves open-ended legacy trials', () => {
    const now = new Date('2026-06-15T00:00:00.000Z')
    expect(isTrialExpired('2026-06-14T23:59:59.000Z', now)).toBe(true)
    expect(isTrialExpired('2026-06-15T00:00:00.000Z', now)).toBe(true)
    expect(isTrialExpired('2026-06-16T00:00:00.000Z', now)).toBe(false)
    expect(isTrialExpired(null, now)).toBe(false)
  })
})
