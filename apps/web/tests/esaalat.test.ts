import { describe, expect, test } from 'bun:test'
import { convertUsdToYer } from '@/lib/billing/esaalat'

describe('Esaalat amount conversion', () => {
  test('converts the selected USD subscription amount to whole Yemeni riyals', () => {
    expect(convertUsdToYer(9, 500)).toBe(4500)
    expect(convertUsdToYer(29, 500)).toBe(14500)
    expect(convertUsdToYer(59 * 10, 500)).toBe(295000)
  })

  test('rejects missing, zero, negative and unsafe exchange values', () => {
    expect(() => convertUsdToYer(0, 500)).toThrow('invalid_usd_amount')
    expect(() => convertUsdToYer(9, 0)).toThrow('invalid_yer_exchange_rate')
    expect(() => convertUsdToYer(9, Number.MAX_VALUE)).toThrow('invalid_yer_amount')
  })
})
