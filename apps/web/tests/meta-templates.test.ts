import { describe, expect, test } from 'bun:test'
import { buildWhatsAppTemplatePayload } from '@/lib/providers/meta'

describe('WhatsApp template payload', () => {
  test('builds the Meta test template payload without optional components', () => {
    expect(buildWhatsAppTemplatePayload('967777123456', {
      name: 'hello_world',
      languageCode: 'en_US',
    })).toEqual({
      messaging_product: 'whatsapp',
      to: '967777123456',
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' },
      },
    })
  })

  test('keeps body template variables in the order supplied', () => {
    expect(buildWhatsAppTemplatePayload('967777123456', {
      name: 'appointment_reminder',
      languageCode: 'ar',
      bodyParameters: ['جارالله', 'الأحد'],
    })).toEqual({
      messaging_product: 'whatsapp',
      to: '967777123456',
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'ar' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'جارالله' },
            { type: 'text', text: 'الأحد' },
          ],
        }],
      },
    })
  })
})
