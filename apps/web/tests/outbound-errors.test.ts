import { describe, expect, test } from 'bun:test'
import { MetaApiError } from '@/lib/providers/meta'
import { isPermanentOutboundError } from '@/lib/runtime/outbound'

describe('outbound failure classification', () => {
  test('Meta policy errors are permanent and do not consume retry attempts', () => {
    expect(isPermanentOutboundError(new MetaApiError('display name approval required', 400))).toBe(true)
  })

  test('rate limits and provider outages remain retryable', () => {
    expect(isPermanentOutboundError(new MetaApiError('rate limited', 429))).toBe(false)
    expect(isPermanentOutboundError(new MetaApiError('provider unavailable', 503))).toBe(false)
    expect(isPermanentOutboundError(new Error('Twilio SMS send failed: HTTP 503'))).toBe(false)
  })

  test('invalid provider requests and missing configuration are permanent', () => {
    expect(isPermanentOutboundError(new Error('Twilio SMS send failed: HTTP 400'))).toBe(true)
    expect(isPermanentOutboundError(new Error('Instagram account_id is required'))).toBe(true)
    expect(isPermanentOutboundError(new Error('META_GRAPH_BASE_URL is required'))).toBe(true)
  })

  test('transport and database failures remain retryable', () => {
    expect(isPermanentOutboundError(new TypeError('fetch failed'))).toBe(false)
    expect(isPermanentOutboundError(new Error('temporary credential database read failure'))).toBe(false)
  })
})
