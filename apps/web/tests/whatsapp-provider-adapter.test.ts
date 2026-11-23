import { describe, expect, test } from 'bun:test'
import {
  adapterForWhatsAppMode,
  MetaWhatsAppAdapter,
  normalizeWhatsAppInbound,
  registerBaileysSendText,
} from '@/lib/channels/whatsapp-provider-adapter'

describe('WhatsApp provider adapters', () => {
  test('cloud_api and coexistence always select Meta, never Baileys', () => {
    expect(adapterForWhatsAppMode('cloud_api').provider).toBe('meta')
    expect(adapterForWhatsAppMode('coexistence').provider).toBe('meta')
    expect(adapterForWhatsAppMode('cloud_api').connectionMode).not.toBe('qr_unofficial')
  })

  test('qr_unofficial always selects Baileys, never Meta', () => {
    const adapter = adapterForWhatsAppMode('qr_unofficial')
    expect(adapter.provider).toBe('baileys')
    expect(adapter.connectionMode).toBe('qr_unofficial')

    let sent = false
    registerBaileysSendText(async () => {
      sent = true
      return { messageId: 'baileys-message' }
    })
    expect(adapterForWhatsAppMode('qr_unofficial').provider).not.toBe('meta')
    expect(() => new MetaWhatsAppAdapter('qr_unofficial' as never)).toThrow('meta_adapter_cannot_send_qr_unofficial')
    expect(sent).toBe(false)
  })

  test('normalizes Meta media into the shared inbound contract', () => {
    const normalized = normalizeWhatsAppInbound({
      id: 'm1',
      from: '967700000000',
      type: 'image',
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'إيصال' },
    }, {
      provider: 'meta', connectionMode: 'coexistence', from: '967700000000', to: '967711111111',
    })
    expect(normalized.provider).toBe('meta')
    expect(normalized.connectionMode).toBe('coexistence')
    expect(normalized.mediaType).toBe('image')
    expect(normalized.mimeType).toBe('image/jpeg')
    expect(normalized.caption).toBe('إيصال')
    expect(normalized.externalMessageId).toBe('m1')
  })
})
