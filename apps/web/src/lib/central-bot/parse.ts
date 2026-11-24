import type { CentralInbound } from './router'

/** Maps a raw Meta Cloud API message to the central bot's minimal inbound shape. */
export function parseCentralMessage(msg: Record<string, unknown>): CentralInbound | null {
  const from = String(msg.from ?? '').trim()
  const messageId = String(msg.id ?? '').trim()
  if (!from || !messageId) return null
  const type = String(msg.type ?? '')
  if (type === 'text') return { from, messageId, type: 'text', text: String((msg.text as { body?: string } | undefined)?.body ?? '') }
  if (type === 'audio') {
    const audio = (msg.audio ?? {}) as { id?: string; mime_type?: string }
    return { from, messageId, type: 'audio', audioId: String(audio.id ?? ''), mediaId: String(audio.id ?? ''), mimeType: audio.mime_type }
  }
  if (type === 'image' || type === 'document') {
    const media = (msg[type] ?? {}) as { id?: string; mime_type?: string; caption?: string; filename?: string }
    return {
      from,
      messageId,
      type,
      mediaId: String(media.id ?? ''),
      mimeType: media.mime_type,
      caption: typeof media.caption === 'string' ? media.caption.slice(0, 1000) : undefined,
      fileName: typeof media.filename === 'string' ? media.filename.slice(0, 200) : undefined,
    }
  }
  if (type === 'interactive') {
    const interactive = (msg.interactive ?? {}) as { button_reply?: { id?: string; title?: string } }
    return { from, messageId, type: 'button', buttonId: String(interactive.button_reply?.id ?? ''), text: String(interactive.button_reply?.title ?? '') }
  }
  if (type === 'button') {
    const button = (msg.button ?? {}) as { payload?: string; text?: string }
    return { from, messageId, type: 'button', buttonId: String(button.payload ?? ''), text: String(button.text ?? '') }
  }
  return { from, messageId, type: 'other' }
}
