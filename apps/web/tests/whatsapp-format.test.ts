import { describe, expect, test } from 'bun:test'
import { formatForWhatsApp } from '@/lib/channels/whatsapp-format'

describe('formatForWhatsApp', () => {
  test('converts Markdown bold to WhatsApp bold', () => {
    expect(formatForWhatsApp('**مرحبا**')).toBe('*مرحبا*')
  })

  test('removes web heading markers and inline code fences', () => {
    expect(formatForWhatsApp('### العنوان\n`التفاصيل`')).toBe('العنوان\nالتفاصيل')
  })

  test('does not leave unsupported double-bold or heading markers', () => {
    const formatted = formatForWhatsApp('## **الخدمة**')
    expect(formatted).toBe('*الخدمة*')
    expect(formatted).not.toContain('**')
    expect(/^#+/m.test(formatted)).toBe(false)
  })

  test('preserves ordinary text and line breaks', () => {
    expect(formatForWhatsApp('سطر أول\nسطر ثانٍ')).toBe('سطر أول\nسطر ثانٍ')
  })
})
