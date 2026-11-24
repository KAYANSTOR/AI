// Pure helpers for inbound WhatsApp QR media (no socket, no I/O) so they are unit-tested.
// The gateway forwards only a descriptor; the app validates it and fetches the bytes on
// demand, after its size/duration/MIME guard and plan checks.

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage']

/** Unwraps ephemeral / view-once / document-with-caption containers. */
export function unwrapMessageContent(content) {
  let current = content
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const wrapper = WRAPPERS.find(key => current[key]?.message)
    if (!wrapper) break
    current = current[wrapper].message
  }
  return current || null
}

function toNumber(value) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'object' && 'low' in value ? Number(value.low) + Number(value.high || 0) * 2 ** 32 : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function clean(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

/** Text or caption of a message (including inside ephemeral / view-once wrappers). */
export function extractText(message) {
  const value = unwrapMessageContent(message?.message)
  if (!value) return ''
  return String(value.conversation || value.extendedTextMessage?.text ||
    value.imageMessage?.caption || value.videoMessage?.caption ||
    value.documentMessage?.caption || value.buttonsResponseMessage?.selectedDisplayText ||
    value.templateButtonReplyMessage?.selectedDisplayText || '').trim()
}

/** Media descriptor for image / audio (incl. ptt voice notes) / document / video messages. */
export function extractMediaDescriptor(message) {
  const value = unwrapMessageContent(message?.message)
  const messageId = message?.key?.id
  if (!value || !messageId) return null
  const pick = [
    ['imageMessage', 'image'], ['audioMessage', 'audio'], ['documentMessage', 'document'],
    ['videoMessage', 'video'], ['stickerMessage', 'image'],
  ].find(([key]) => value[key])
  if (!pick) return null
  const [key, kind] = pick
  const media = value[key]
  return {
    messageId: String(messageId),
    kind,
    mimeType: clean(media.mimetype, 120),
    fileName: clean(media.fileName, 200),
    fileLength: toNumber(media.fileLength),
    seconds: toNumber(media.seconds),
    ptt: Boolean(media.ptt),
    caption: clean(media.caption, 1000),
  }
}

/** Short-lived cache of raw messages so the app can request the bytes after its checks. */
export function createMediaMessageCache({ ttlMs = 15 * 60 * 1000, max = 500, now = () => Date.now() } = {}) {
  const entries = new Map()
  const key = (channelId, id) => channelId + ':' + id
  return {
    set(channelId, message) {
      const id = message?.key?.id
      if (!id) return
      entries.set(key(channelId, id), { message, at: now() })
      while (entries.size > max) entries.delete(entries.keys().next().value)
    },
    get(channelId, id) {
      const entry = entries.get(key(channelId, id))
      if (!entry) return null
      if (now() - entry.at > ttlMs) { entries.delete(key(channelId, id)); return null }
      return entry.message
    },
  }
}

export const MEDIA_HARD_MAX_BYTES = 5 * 1024 * 1024

/** The app passes its plan limit; never above the hard 5 MB cap. */
export function requestedMaxBytes(raw) {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MEDIA_HARD_MAX_BYTES) : MEDIA_HARD_MAX_BYTES
}
