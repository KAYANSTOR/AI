import { describe, expect, test } from 'bun:test'
import { checkEligibility } from '@/lib/channels/eligibility'

const NOW = new Date('2026-03-01T12:00:00.000Z')

describe('channel eligibility', () => {
  test('voice is always realtime', () => {
    expect(checkEligibility({ channel: 'phone', now: NOW })).toEqual({ allowed: true, mode: 'realtime' })
  })

  test('whatsapp is freeform inside the 24h customer service window', () => {
    const result = checkEligibility({
      channel: 'whatsapp',
      lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
      now: NOW,
    })
    expect(result).toEqual({ allowed: true, mode: 'freeform' })
  })

  test('whatsapp falls back to template-only after the window closes', () => {
    const result = checkEligibility({
      channel: 'whatsapp',
      lastInboundAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
      now: NOW,
    })
    expect(result).toEqual({ allowed: true, mode: 'template_only' })
  })

  test('whatsapp with no inbound history is template-only', () => {
    expect(checkEligibility({ channel: 'whatsapp', now: NOW })).toEqual({ allowed: true, mode: 'template_only' })
  })

  test('instagram requires the customer to start the conversation', () => {
    expect(checkEligibility({ channel: 'instagram', now: NOW })).toEqual({
      allowed: false,
      reason: 'instagram_user_must_start',
    })
    expect(
      checkEligibility({ channel: 'instagram', lastInboundAt: NOW.toISOString(), now: NOW })
    ).toEqual({ allowed: true, mode: 'freeform' })
  })

  test('sms is freeform', () => {
    expect(checkEligibility({ channel: 'sms', now: NOW })).toEqual({ allowed: true, mode: 'freeform' })
  })

  test('an opted-out contact is never messaged, on any channel', () => {
    for (const channel of ['sms', 'whatsapp', 'instagram', 'phone'] as const) {
      expect(checkEligibility({ channel, optedOut: true, lastInboundAt: NOW.toISOString(), now: NOW })).toEqual({
        allowed: false,
        reason: 'contact_opted_out',
      })
    }
  })

  test('quiet hours suppress automated sends', () => {
    const result = checkEligibility({
      channel: 'sms',
      quietHours: { startHour: 8, endHour: 20 },
      now: new Date('2026-03-01T02:00:00.000Z'),
    })
    expect(result).toEqual({ allowed: false, reason: 'quiet_hours' })
  })
})
