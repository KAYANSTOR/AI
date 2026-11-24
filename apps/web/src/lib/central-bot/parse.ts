import type { CentralInbound } from './router'

/** Maps a raw Meta Cloud API message to the central bot's minimal inbound shape. */
export function parseCentralMessage(msg: Record<string, unknown>): CentralInbound | null {
  const from = String(msg.from ?? '').trim()
  const messageId = String(msg.id ?? '').trim()
  if (!from || !messageId) return null
  const type = String(msg.type ?? '')
  if (type === 'text') return { from, messageId, type: 'text', text: String((msg.text as { body?: string } | undefined)?.body ?? '') }
  if (type === 'audio') return { from, messageId, type: 'audio', audioId: String((msg.audio as { id?: string } | undefined)?.id ?? '') }
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
