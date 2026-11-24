import { extractDocxText } from '@/lib/knowledge/document-parser'
import { extractPdfText } from '@/lib/knowledge/pdf-extractor'

/**
 * Upload hardening for WhatsApp media: allowlisted MIME types, size caps, and magic-byte
 * checks (the declared type proves nothing). SVG/HTML and executables never pass.
 */
export type MediaKind = 'audio' | 'image' | 'document'
type Media = { bytes: Buffer; mimeType: string }

const MB = 1024 * 1024
const LIMITS: Record<MediaKind, number> = { audio: 16 * MB, image: 5 * MB, document: 5 * MB }
const AUDIO = new Set(['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm', 'audio/wav'])
const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOCUMENT = new Set(['application/pdf', DOCX, 'text/plain', 'text/csv', 'text/markdown'])

function startsWith(bytes: Buffer, signature: number[], offset = 0) {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte)
}

function imageMagicOk(media: Media) {
  if (media.mimeType === 'image/jpeg') return startsWith(media.bytes, [0xff, 0xd8, 0xff])
  if (media.mimeType === 'image/png') return startsWith(media.bytes, [0x89, 0x50, 0x4e, 0x47])
  if (media.mimeType === 'image/webp') return startsWith(media.bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(media.bytes, [0x57, 0x45, 0x42, 0x50], 8)
  return false
}

function documentMagicOk(media: Media) {
  if (media.mimeType === 'application/pdf') return media.bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  if (media.mimeType === DOCX) return media.bytes.length >= 4 && media.bytes.readUInt32LE(0) === 0x04034b50
  return !media.bytes.includes(0)
}

export function validateMedia(kind: MediaKind, media: Media): { ok: true } | { ok: false; reply: string } {
  const mime = media.mimeType.split(';')[0].trim().toLowerCase()
  const normalized = { ...media, mimeType: mime }
  if (!media.bytes.length) return { ok: false, reply: 'الملف فارغ.' }
  if (media.bytes.length > LIMITS[kind]) return { ok: false, reply: `حجم الملف أكبر من المسموح (${LIMITS[kind] / MB} ميجابايت).` }
  if (kind === 'audio') return AUDIO.has(mime) ? { ok: true } : { ok: false, reply: 'صيغة الصوت غير مدعومة.' }
  if (kind === 'image') {
    return IMAGE.has(mime) && imageMagicOk(normalized) ? { ok: true } : { ok: false, reply: 'الصور المدعومة: JPG وPNG وWEBP فقط.' }
  }
  return DOCUMENT.has(mime) && documentMagicOk(normalized) ? { ok: true } : { ok: false, reply: 'الملفات المدعومة: PDF وDOCX وTXT وCSV فقط.' }
}

/** Text extraction reusing the knowledge-base parsers (200k character cap). */
export async function readDocumentText(media: Media): Promise<string> {
  const mime = media.mimeType.split(';')[0].trim().toLowerCase()
  let text: string
  if (mime === 'application/pdf') text = await extractPdfText(media.bytes)
  else if (mime === DOCX) text = extractDocxText(media.bytes)
  else text = new TextDecoder('utf-8', { fatal: true }).decode(media.bytes).replace(/^\uFEFF/, '')
  return text.trim().slice(0, 200_000)
}
