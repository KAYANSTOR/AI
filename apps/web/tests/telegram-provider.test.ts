import { describe, expect, test } from 'bun:test'
import { telegramUpdateId } from '../src/lib/providers/telegram'

describe('Telegram provider identity', () => {
  test('derives a stable idempotency key from the globally unique update id', () => {
    expect(telegramUpdateId(123456)).toBe(telegramUpdateId(123456))
    expect(telegramUpdateId(123456)).not.toBe(telegramUpdateId(123457))
    expect(/^[a-f0-9]{64}$/.test(telegramUpdateId(123456))).toBe(true)
  })
})
