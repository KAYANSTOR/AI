import { describe, expect, test } from 'bun:test'
import { AUTH_MESSAGES } from '@/lib/auth/messages'

describe('auth messages', () => {
  test('every message is non-empty Arabic text', () => {
    for (const message of Object.values(AUTH_MESSAGES)) {
      expect(message.length).toBeGreaterThan(5)
      expect(/[\u0600-\u06ff]/u.test(message)).toBe(true)
    }
  })
})
