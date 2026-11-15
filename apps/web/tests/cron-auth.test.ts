import { describe, expect, test } from 'bun:test'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'

const secret = 'a'.repeat(32)

describe('cron request authorization', () => {
  test('accepts the matching bearer secret', () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true)
  })

  test('rejects a wrong secret with the same length', () => {
    expect(isAuthorizedCronRequest(`Bearer ${'b'.repeat(32)}`, secret)).toBe(false)
  })

  test('rejects a credential with a different length', () => {
    expect(isAuthorizedCronRequest(`Bearer ${'a'.repeat(31)}`, secret)).toBe(false)
  })

  test('rejects a missing authorization header', () => {
    expect(isAuthorizedCronRequest(null, secret)).toBe(false)
  })

  test('rejects a missing secret', () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, undefined)).toBe(false)
  })

  test('rejects a matching credential when the secret is shorter than 32 characters', () => {
    expect(isAuthorizedCronRequest('Bearer short-secret', 'short-secret')).toBe(false)
  })

  test('rejects a matching secret without the Bearer prefix', () => {
    expect(isAuthorizedCronRequest(secret, secret)).toBe(false)
  })
})
