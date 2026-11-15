import { describe, expect, test } from 'bun:test'
import { parseWhatsAppInbound } from '@/lib/channels/whatsapp-inbound'

describe('parseWhatsAppInbound', () => {
  test('text messages pass through to the agent', () => {
    expect(parseWhatsAppInbound({ type: 'text', text: { body: ' مرحبا ' } })).toEqual({ kind: 'text', text: 'مرحبا' })
  })

  test('images are recorded with their caption instead of being dropped', () => {
    expect(parseWhatsAppInbound({ type: 'image', image: { id: 'm1', caption: 'صورة الإيصال' } })).toEqual({
      kind: 'media',
      messageType: 'image',
      content: '[صورة] صورة الإيصال',
    })
    expect(parseWhatsAppInbound({ type: 'image', image: { id: 'm1' } })).toEqual({
      kind: 'media',
      messageType: 'image',
      content: '[صورة]',
    })
  })

  test('voice notes, video and documents map to schema message types', () => {
    expect(parseWhatsAppInbound({ type: 'audio', audio: { id: 'a', voice: true } })).toEqual({ kind: 'media', messageType: 'audio', content: '[رسالة صوتية]' })
    expect(parseWhatsAppInbound({ type: 'video', video: { id: 'v' } })).toEqual({ kind: 'media', messageType: 'video', content: '[فيديو]' })
    expect(parseWhatsAppInbound({ type: 'document', document: { id: 'd', filename: 'invoice.pdf' } })).toEqual({
      kind: 'media',
      messageType: 'file',
      content: '[مستند] invoice.pdf',
    })
  })

  test('button and list replies are treated as customer text', () => {
    expect(parseWhatsAppInbound({ type: 'button', button: { text: 'تأكيد', payload: 'CONFIRM' } })).toEqual({ kind: 'text', text: 'تأكيد' })
    expect(
      parseWhatsAppInbound({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 's1', title: 'الخميس 6:30' } } })
    ).toEqual({ kind: 'text', text: 'الخميس 6:30' })
  })

  test('reactions are ignored explicitly and unknown types are still recorded', () => {
    expect(parseWhatsAppInbound({ type: 'reaction', reaction: { emoji: 'x' } })).toEqual({ kind: 'ignored', reason: 'unsupported_reaction' })
    expect(parseWhatsAppInbound({ type: 'order' })).toEqual({ kind: 'media', messageType: 'file', content: '[رسالة غير مدعومة: order]' })
  })
})
