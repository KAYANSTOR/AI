import { describe, expect, test } from 'bun:test'
import { isInQuietHours, nextSendWindowOpen } from '@/lib/channels/quiet-hours'

describe('quiet hours', () => {
  test('blocks outside 9-21 UTC window window', () => {
    const policy = { allowedStartHour: 9, allowedEndHour: 21, timezone: 'UTC' }
    const morning = new Date('2026-06-01T08:30:00Z')
    const noon = new Date('2026-06-01T12:00:00Z')
    const night = new Date('2026-06-01T22:00:00Z')

    expect(isInQuietHours(policy, morning)).toBe(true)
    expect(isInQuietHours(policy, noon)).toBe(false)
    expect(isInQuietHours(policy, night)).toBe(true)
  })

  test('next open is in the future when currently quiet', () => {
    const policy = { allowedStartHour: 9, allowedEndHour: 21, timezone: 'UTC' }
    const night = new Date('2026-06-01T22:00:00Z')
    const next = nextSendWindowOpen(policy, night)
    expect(next.getTime()).toBeGreaterThan(night.getTime())
  })
})
