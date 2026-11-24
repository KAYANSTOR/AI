/** Inbox presentation of a stored message's media metadata (messages.media). Pure and client-safe. */
export type MediaBadge = {
  kind: 'audio' | 'image' | 'document' | 'other'
  title: string
  detail: string | null
  rejected: boolean
}

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

export function mediaBadgeFor(media: Record<string, unknown> | null | undefined, messageType: string): MediaBadge | null {
  if (!media || typeof media !== 'object') return null
  const kind = media.kind === 'audio' || media.kind === 'image' || media.kind === 'document' ? media.kind
    : messageType === 'audio' ? 'audio' : messageType === 'image' ? 'image' : messageType === 'file' ? 'document' : 'other'
  const rejected = media.status === 'rejected'
  const seconds = typeof media.seconds === 'number' && Number.isFinite(media.seconds) ? Math.round(media.seconds) : null
  if (kind === 'audio') {
    return {
      kind, rejected,
      title: (media.voiceNote ? 'رسالة صوتية' : 'ملف صوتي') + (seconds ? ` · ${seconds} ث` : ''),
      detail: str(media.transcript, 2000),
    }
  }
  if (kind === 'image') {
    return { kind, rejected, title: 'صورة', detail: str(media.caption, 600) ?? str(media.description, 600) }
  }
  if (kind === 'document') {
    return { kind, rejected, title: str(media.fileName, 120) ?? 'ملف مرفق', detail: null }
  }
  return { kind, rejected, title: 'مرفق وسائط', detail: null }
}
