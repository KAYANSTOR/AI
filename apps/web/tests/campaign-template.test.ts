import { describe, expect, test } from 'bun:test'
import { renderCampaignTemplate } from '@/lib/campaigns/template'

describe('campaign template rendering', () => {
  test('replaces the customer name token in single and double braces', () => {
    expect(renderCampaignTemplate('مرحباً {customer_name} / {{customer_name}}', 'سارة'))
      .toBe('مرحباً سارة / سارة')
  })

  test('uses a neutral fallback when the recipient has no name', () => {
    expect(renderCampaignTemplate('مرحباً {customer_name}'))
      .toBe('مرحباً عميلنا العزيز')
  })

  test('preserves unrelated text and limits inserted names', () => {
    const longName = 'س'.repeat(150)
    expect(renderCampaignTemplate('{customer_name} — أهلاً', longName))
      .toBe('س'.repeat(100) + ' — أهلاً')
  })
})
