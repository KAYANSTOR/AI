import type { MediaAttachment } from './attachment'
import { measureAudioSeconds } from './audio-duration'

/**
 * DoS & MIME guard for every inbound attachment. `preflightMedia` runs on the metadata
 * the provider declares (before any byte is downloaded); `inspectMediaBytes` re-checks
 * the real size, magic bytes and audio duration after a bounded download.
 */
export type AnalyzableKind = 'image' | 'audio' | 'document'

export type MediaLimits = { maxBytes: number; maxAudioSeconds: number; documentsAllowed: boolean }

export type MediaRejectionCode =
  | 'blocked_type' | 'unsupported_type' | 'too_large' | 'too_long'
  | 'documents_not_in_plan' | 'empty' | 'magic_mismatch'

export type MediaRejection = { ok: false; code: MediaRejectionCode; reply: string }
export type MediaAccepted = { ok: true; kind: AnalyzableKind; mimeType: string | null }

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export const AUDIO_MIME = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/aac'] as const
export const DOCUMENT_MIME = ['application/pdf', 'text/plain', 'text/csv'] as const

const BLOCKED_EXTENSIONS = /\.(exe|apk|zip|rar|html?|js|mjs|svg|svgz|bat|cmd|msi|jar|scr|dll|7z)$/i
const BLOCKED_MIME = /(svg|html|javascript|ecmascript|x-msdownload|x-msdos|x-executable|android\.package|zip|rar|7z|x-sh|java-archive)/i

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg',
  'audio/opus': 'audio/ogg', 'audio/x-opus+ogg': 'audio/ogg', 'audio/mp3': 'audio/mpeg', 'audio/x-mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav', 'audio/x-aac': 'audio/aac', 'audio/aacp': 'audio/aac',
  'video/webm': 'audio/webm', 'application/csv': 'text/csv', 'text/comma-separated-values': 'text/csv',
}

export const MEDIA_REPLIES = {
  blocked: 'عذراً، لا يمكننا استقبال هذا النوع من الملفات لأسباب أمنية. أرسل صورة (JPG/PNG/WEBP) أو رسالة صوتية أو ملف PDF/TXT/CSV.',
  unsupported: 'عذراً، هذه الصيغة غير مدعومة. أرسل صورة (JPG/PNG/WEBP) أو رسالة صوتية أو ملف PDF/TXT/CSV.',
  tooLarge: (mb: number) => `عذراً، حجم الملف أكبر من المسموح (${mb} ميجابايت). أرسل ملفاً أصغر أو اكتب سؤالك نصاً.`,
  tooLong: (seconds: number) => `عذراً، الرسالة الصوتية أطول من المسموح (${seconds} ثانية). أرسل رسالة أقصر أو اكتب سؤالك نصاً.`,
  documents: 'شكراً لإرسال الملف. تحليل الملفات متاح في الباقات المدفوعة فقط، ويمكنك كتابة سؤالك نصاً وسنساعدك فوراً.',
  empty: 'عذراً، الملف فارغ أو تالف. أرسله مرة أخرى من فضلك.',
  video: 'شكراً لك. لا نحلل مقاطع الفيديو حالياً؛ أرسل صورة أو رسالة صوتية أو اكتب سؤالك نصاً.',
} as const

export function normalizeMime(value: string | null | undefined): string | null {
  const base = String(value ?? '').split(';')[0].trim().toLowerCase()
  if (!base) return null
  return MIME_ALIASES[base] ?? base
}

function reject(code: MediaRejectionCode, reply: string): MediaRejection {
  return { ok: false, code, reply }
}

function kindForMime(mime: string): AnalyzableKind | null {
  if ((IMAGE_MIME as readonly string[]).includes(mime)) return 'image'
  if ((AUDIO_MIME as readonly string[]).includes(mime)) return 'audio'
  if ((DOCUMENT_MIME as readonly string[]).includes(mime)) return 'document'
  return null
}

function mb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

/** Checks done before any download: extension blocklist, MIME allowlist, declared size/duration. */
export function preflightMedia(attachment: MediaAttachment, limits: MediaLimits): MediaAccepted | MediaRejection {
  const fileName = attachment.fileName ?? ''
  const rawMime = String(attachment.mimeType ?? '').toLowerCase()
  if (BLOCKED_EXTENSIONS.test(fileName) || BLOCKED_MIME.test(rawMime)) return reject('blocked_type', MEDIA_REPLIES.blocked)
  if (attachment.kind === 'video') return reject('unsupported_type', MEDIA_REPLIES.video)

  const mime = normalizeMime(attachment.mimeType)
  let kind: AnalyzableKind | null
  if (mime) {
    kind = kindForMime(mime)
    if (!kind) return reject('unsupported_type', MEDIA_REPLIES.unsupported)
  } else {
    // Messenger/Instagram do not declare a MIME type; the bytes decide after download.
    kind = attachment.kind === 'image' || attachment.kind === 'audio' || attachment.kind === 'document' ? attachment.kind : null
    if (!kind) return reject('unsupported_type', MEDIA_REPLIES.unsupported)
  }
  if (kind === 'document' && !limits.documentsAllowed) return reject('documents_not_in_plan', MEDIA_REPLIES.documents)
  if (attachment.declaredBytes !== null && attachment.declaredBytes > limits.maxBytes) {
    return reject('too_large', MEDIA_REPLIES.tooLarge(mb(limits.maxBytes)))
  }
  if (kind === 'audio' && attachment.declaredSeconds !== null && attachment.declaredSeconds > limits.maxAudioSeconds) {
    return reject('too_long', MEDIA_REPLIES.tooLong(limits.maxAudioSeconds))
  }
  return { ok: true, kind, mimeType: mime }
}

function startsWith(bytes: Buffer, signature: number[], offset = 0) {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(bytes: Buffer, start: number, end: number) {
  return bytes.subarray(start, end).toString('latin1')
}

/** Detects the real type from magic bytes; returns null when nothing allowlisted matches. */
export function sniffMime(bytes: Buffer): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'audio/wav'
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg'
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm'
  if (ascii(bytes, 4, 8) === 'ftyp') return 'audio/mp4'
  if (ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg'
  if (ascii(bytes, 0, 4) === 'ADIF') return 'audio/aac'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

function looksDangerous(bytes: Buffer): boolean {
  if (ascii(bytes, 0, 2) === 'MZ') return true // Windows executable
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true // ELF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return true // zip / apk / jar
  if (ascii(bytes, 0, 4) === 'Rar!' || startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf])) return true
  const head = ascii(bytes, 0, 512).replace(/^\uFEFF/, '').trimStart().toLowerCase()
  return head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype html') ||
    head.startsWith('<html') || head.startsWith('<script')
}

function isPlainText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, 64 * 1024))
    return true
  } catch {
    return false
  }
}

/** Checks after a bounded download: real size, magic bytes and real audio duration. */
export function inspectMediaBytes(
  accepted: MediaAccepted,
  bytes: Buffer,
  limits: MediaLimits,
  declaredSeconds: number | null = null
): { ok: true; kind: AnalyzableKind; mimeType: string; seconds: number | null } | MediaRejection {
  if (!bytes.length) return reject('empty', MEDIA_REPLIES.empty)
  if (bytes.length > limits.maxBytes) return reject('too_large', MEDIA_REPLIES.tooLarge(mb(limits.maxBytes)))
  if (looksDangerous(bytes)) return reject('blocked_type', MEDIA_REPLIES.blocked)

  const sniffed = sniffMime(bytes)
  let mimeType: string
  if (accepted.kind === 'document') {
    const declared = accepted.mimeType
    if (sniffed === 'application/pdf') mimeType = 'application/pdf'
    else if (!sniffed && isPlainText(bytes) && declared !== 'application/pdf') mimeType = declared === 'text/csv' ? 'text/csv' : 'text/plain'
    else return reject('magic_mismatch', MEDIA_REPLIES.unsupported)
    if (!limits.documentsAllowed) return reject('documents_not_in_plan', MEDIA_REPLIES.documents)
  } else {
    const sniffedKind = sniffed ? kindForMime(sniffed) : null
    if (!sniffed || sniffedKind !== accepted.kind) return reject('magic_mismatch', MEDIA_REPLIES.unsupported)
    mimeType = sniffed
  }

  let seconds: number | null = null
  if (accepted.kind === 'audio') {
    const measured = measureAudioSeconds(mimeType, bytes)
    seconds = Math.max(measured ?? 0, declaredSeconds ?? 0) || null
    if (seconds !== null && seconds > limits.maxAudioSeconds + 0.5) {
      return reject('too_long', MEDIA_REPLIES.tooLong(limits.maxAudioSeconds))
    }
  }
  return { ok: true, kind: accepted.kind, mimeType, seconds }
}
