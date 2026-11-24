/**
 * Unified `MediaAttachment`: every channel adapter maps its provider payload to this
 * shape before the message reaches the inbound worker / runtime, so validation,
 * analysis and storage follow one path for all channels.
 */
export type MediaChannel = 'whatsapp_qr' | 'whatsapp_cloud' | 'telegram' | 'messenger' | 'instagram' | 'web'
export type MediaKind = 'image' | 'audio' | 'document' | 'video' | 'unknown'

export type MediaSource =
  | { type: 'meta_cloud'; mediaId: string }
  | { type: 'baileys'; channelId: string; messageId: string }
  | { type: 'telegram'; fileId: string }
  | { type: 'url'; url: string }
  | { type: 'inline'; bytes: Buffer }

export type MediaAttachment = {
  channel: MediaChannel
  kind: MediaKind
  mimeType: string | null
  fileName: string | null
  /** Size declared by the provider before download (bytes). */
  declaredBytes: number | null
  /** Duration declared by the provider before download (seconds). */
  declaredSeconds: number | null
  caption: string | null
  voiceNote: boolean
  source: MediaSource
}

function positive(value: unknown): number | null {
  const parsed = typeof value === 'object' && value !== null && 'low' in value
    ? Number((value as { low: number }).low)
    : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function text(value: unknown, max = 1000): string | null {
  const clean = typeof value === 'string' ? value.trim() : ''
  return clean ? clean.slice(0, max) : null
}

function kindFromMime(mime: string | null): MediaKind {
  if (!mime) return 'unknown'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

type CloudMedia = { id?: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean; file_size?: number }

/** Meta WhatsApp Cloud API message (`image` / `audio` / `voice` / `document`). */
export function fromWhatsAppCloud(message: Record<string, unknown>): MediaAttachment | null {
  const type = String(message.type ?? '')
  const kind: MediaKind | null = type === 'image' || type === 'sticker' ? 'image'
    : type === 'audio' || type === 'voice' ? 'audio'
      : type === 'document' ? 'document'
        : type === 'video' ? 'video' : null
  if (!kind) return null
  const media = (message[type] ?? {}) as CloudMedia
  const mediaId = String(media.id ?? '').trim()
  if (!mediaId) return null
  return {
    channel: 'whatsapp_cloud',
    kind,
    mimeType: text(media.mime_type, 120),
    fileName: text(media.filename, 200),
    declaredBytes: positive(media.file_size),
    declaredSeconds: null,
    caption: text(media.caption),
    voiceNote: type === 'voice' || Boolean(media.voice),
    source: { type: 'meta_cloud', mediaId },
  }
}

/** Telegram `photo` / `voice` / `audio` / `document` message. */
export function fromTelegram(message: Record<string, unknown>): MediaAttachment | null {
  const caption = text(message.caption)
  const photos = Array.isArray(message.photo) ? message.photo as Array<Record<string, unknown>> : null
  if (photos?.length) {
    const largest = photos[photos.length - 1]
    return {
      channel: 'telegram', kind: 'image', mimeType: 'image/jpeg', fileName: null,
      declaredBytes: positive(largest.file_size), declaredSeconds: null, caption, voiceNote: false,
      source: { type: 'telegram', fileId: String(largest.file_id ?? '') },
    }
  }
  for (const key of ['voice', 'audio', 'document', 'video'] as const) {
    const file = message[key] as Record<string, unknown> | undefined
    if (!file?.file_id) continue
    const mimeType = text(file.mime_type, 120) ?? (key === 'voice' ? 'audio/ogg' : null)
    return {
      channel: 'telegram',
      kind: key === 'voice' || key === 'audio' ? 'audio' : key === 'video' ? 'video' : kindFromMime(mimeType),
      mimeType,
      fileName: text(file.file_name, 200),
      declaredBytes: positive(file.file_size),
      declaredSeconds: positive(file.duration),
      caption,
      voiceNote: key === 'voice',
      source: { type: 'telegram', fileId: String(file.file_id) },
    }
  }
  return null
}

/** Messenger / Instagram attachment (`image` / `audio` / `file` / `video` with a CDN URL). */
export function fromMetaMessaging(
  channel: 'messenger' | 'instagram',
  attachment: { type?: string; payload?: { url?: string } } | undefined
): MediaAttachment | null {
  const url = String(attachment?.payload?.url ?? '').trim()
  const type = String(attachment?.type ?? '').toLowerCase()
  if (!url || !/^https:\/\//i.test(url)) return null
  const kind: MediaKind = type === 'image' ? 'image' : type === 'audio' ? 'audio' : type === 'video' ? 'video' : type === 'file' ? 'document' : 'unknown'
  let fileName: string | null = null
  try { fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || null } catch { fileName = null }
  return {
    channel, kind, mimeType: null, fileName: kind === 'document' ? fileName : null,
    declaredBytes: null, declaredSeconds: null, caption: null, voiceNote: kind === 'audio',
    source: { type: 'url', url },
  }
}

/** Descriptor forwarded by the Baileys gateway (WhatsApp QR); bytes are fetched on demand. */
export function fromBaileysDescriptor(channelId: string, descriptor: Record<string, unknown> | null | undefined): MediaAttachment | null {
  if (!descriptor) return null
  const messageId = String(descriptor.messageId ?? '').trim()
  const kind = String(descriptor.kind ?? '')
  if (!messageId || !['image', 'audio', 'document', 'video', 'unknown'].includes(kind)) return null
  return {
    channel: 'whatsapp_qr',
    kind: kind as MediaKind,
    mimeType: text(descriptor.mimeType, 120),
    fileName: text(descriptor.fileName, 200),
    declaredBytes: positive(descriptor.fileLength),
    declaredSeconds: positive(descriptor.seconds),
    caption: text(descriptor.caption),
    voiceNote: Boolean(descriptor.ptt),
    source: { type: 'baileys', channelId, messageId },
  }
}

/** Browser upload / voice recording from the web chat and personal assistant. */
export function fromWebUpload(file: { name: string; type: string; size: number }, bytes: Buffer, caption?: string | null, voiceNote = false): MediaAttachment {
  const mimeType = text(file.type, 120)
  return {
    channel: 'web',
    kind: kindFromMime(mimeType),
    mimeType,
    fileName: text(file.name, 200),
    declaredBytes: positive(file.size),
    declaredSeconds: null,
    caption: text(caption ?? null),
    voiceNote,
    source: { type: 'inline', bytes },
  }
}
