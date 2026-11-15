import type { InboundMessageType } from '@/lib/runtime/process-inbound'

export type WhatsAppInbound =
  | { kind: 'text'; text: string }
  | { kind: 'media'; messageType: Exclude<InboundMessageType, 'text'>; content: string }
  | { kind: 'ignored'; reason: string }

type Json = Record<string, unknown>

function obj(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const MEDIA_LABELS: Record<string, { type: Exclude<InboundMessageType, 'text'>; label: string }> = {
  image: { type: 'image', label: 'صورة' },
  sticker: { type: 'image', label: 'ملصق' },
  audio: { type: 'audio', label: 'رسالة صوتية' },
  video: { type: 'video', label: 'فيديو' },
  document: { type: 'file', label: 'مستند' },
}

/**
 * Classify one WhatsApp Cloud API message object. Button and list replies carry
 * text the agent can act on; media is recorded for staff; reactions and
 * system notices are ignored explicitly instead of being silently dropped.
 */
export function parseWhatsAppInbound(msg: Json): WhatsAppInbound {
  const type = str(msg.type) || (msg.text ? 'text' : '')

  if (type === 'text') {
    const text = str(obj(msg.text).body)
    return text ? { kind: 'text', text } : { kind: 'ignored', reason: 'empty_text' }
  }

  if (type === 'button') {
    const text = str(obj(msg.button).text) || str(obj(msg.button).payload)
    return text ? { kind: 'text', text } : { kind: 'ignored', reason: 'empty_button' }
  }

  if (type === 'interactive') {
    const interactive = obj(msg.interactive)
    const reply = obj(interactive.button_reply ?? interactive.list_reply)
    const text = str(reply.title) || str(reply.id)
    return text ? { kind: 'text', text } : { kind: 'ignored', reason: 'empty_interactive' }
  }

  const media = MEDIA_LABELS[type]
  if (media) {
    const payload = obj(msg[type])
    const caption = str(payload.caption) || str(payload.filename)
    return {
      kind: 'media',
      messageType: media.type,
      content: caption ? `[${media.label}] ${caption}` : `[${media.label}]`,
    }
  }

  if (type === 'location') {
    const location = obj(msg.location)
    const place = [str(location.name), str(location.address)].filter(Boolean).join(' - ')
    const coords =
      typeof location.latitude === 'number' && typeof location.longitude === 'number'
        ? `${location.latitude},${location.longitude}`
        : ''
    return { kind: 'media', messageType: 'file', content: `[موقع] ${[place, coords].filter(Boolean).join(' ')}`.trim() }
  }

  if (type === 'contacts') {
    return { kind: 'media', messageType: 'file', content: '[جهة اتصال]' }
  }

  if (type === 'reaction' || type === 'system' || type === 'ephemeral') {
    return { kind: 'ignored', reason: `unsupported_${type}` }
  }

  return { kind: 'media', messageType: 'file', content: `[رسالة غير مدعومة: ${type || 'unknown'}]` }
}
