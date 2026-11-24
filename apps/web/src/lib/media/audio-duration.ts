/**
 * Real duration of an audio buffer without decoding it: Ogg (Opus/Vorbis) granule
 * position, WAV header byte rate, MP4 `mvhd` box. Formats without a cheap header
 * (MP3/AAC/WebM) fall back to a conservative byte-rate estimate.
 */
function oggSeconds(bytes: Buffer): number | null {
  const head = bytes.subarray(0, Math.min(bytes.length, 512))
  let rate: number | null = null
  const opus = head.indexOf('OpusHead', 0, 'latin1')
  if (opus >= 0) rate = 48_000
  const vorbis = head.indexOf('\x01vorbis', 0, 'latin1')
  if (rate === null && vorbis >= 0 && vorbis + 16 <= head.length) rate = head.readUInt32LE(vorbis + 12)
  if (!rate) return null
  const last = bytes.lastIndexOf('OggS', bytes.length - 1, 'latin1')
  if (last < 0 || last + 14 > bytes.length) return null
  const granule = Number(bytes.readBigUInt64LE(last + 6))
  if (!Number.isFinite(granule) || granule <= 0) return null
  // Opus granules include the 48 kHz pre-skip (a few ms); negligible for limits.
  return granule / rate
}

function wavSeconds(bytes: Buffer): number | null {
  if (bytes.length < 44) return null
  const byteRate = bytes.readUInt32LE(28)
  if (!byteRate) return null
  const data = bytes.indexOf('data', 12, 'latin1')
  const payload = data >= 0 && data + 8 <= bytes.length ? Math.min(bytes.readUInt32LE(data + 4), bytes.length - data - 8) : bytes.length - 44
  return payload / byteRate
}

function mp4Seconds(bytes: Buffer): number | null {
  const box = bytes.indexOf('mvhd', 0, 'latin1')
  if (box < 0 || box + 24 > bytes.length) return null
  const version = bytes[box + 4]
  if (version === 1) {
    if (box + 36 > bytes.length) return null
    const timescale = bytes.readUInt32BE(box + 24)
    const duration = Number(bytes.readBigUInt64BE(box + 28))
    return timescale ? duration / timescale : null
  }
  const timescale = bytes.readUInt32BE(box + 16)
  const duration = bytes.readUInt32BE(box + 20)
  return timescale ? duration / timescale : null
}

/** Conservative estimate (assumes a low bitrate, so long files are never under-counted). */
const FALLBACK_BYTES_PER_SECOND: Record<string, number> = {
  'audio/mpeg': 16_000, // 128 kbps
  'audio/aac': 12_000, // 96 kbps
  'audio/webm': 4_000, // 32 kbps opus
}

export function measureAudioSeconds(mimeType: string, bytes: Buffer): number | null {
  try {
    if (mimeType === 'audio/ogg') return oggSeconds(bytes)
    if (mimeType === 'audio/wav') return wavSeconds(bytes)
    if (mimeType === 'audio/mp4') return mp4Seconds(bytes)
    const rate = FALLBACK_BYTES_PER_SECOND[mimeType]
    return rate ? bytes.length / rate : null
  } catch {
    return null
  }
}
