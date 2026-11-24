import type { CentralBotConfig } from './config'

/** Minimal Meta Cloud API client for the central bot. `fetchImpl` is injectable for tests. */
type FetchLike = typeof fetch

export class CentralMetaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'CentralMetaError'
  }
}

async function graph(config: CentralBotConfig, path: string, init: RequestInit, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${config.graphBaseUrl}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.accessToken}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new CentralMetaError(`central_meta_http_${response.status}`, response.status)
  return response
}

function toDigits(phone: string) { return phone.replace(/\D/g, '') }

export async function sendCentralText(config: CentralBotConfig, to: string, text: string, fetchImpl: FetchLike = fetch) {
  await graph(config, `${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toDigits(to), type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } }),
  }, fetchImpl)
}

/** Interactive reply buttons (max 3, title ≤ 20 chars, id ≤ 256 chars). */
export async function sendCentralButtons(
  config: CentralBotConfig,
  to: string,
  text: string,
  buttons: { id: string; title: string }[],
  fetchImpl: FetchLike = fetch
) {
  await graph(config, `${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((button) => ({ type: 'reply', reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) } })) },
      },
    }),
  }, fetchImpl)
}

const MAX_AUDIO_BYTES = 16 * 1024 * 1024

/** Media API: resolve the media URL, then download the bytes with the same token. */
export async function downloadCentralMedia(config: CentralBotConfig, mediaId: string, fetchImpl: FetchLike = fetch) {
  if (!/^[0-9A-Za-z_-]{1,128}$/.test(mediaId)) throw new CentralMetaError('invalid_media_id', 400)
  const meta = await (await graph(config, encodeURIComponent(mediaId), { method: 'GET' }, fetchImpl)).json() as { url?: string; mime_type?: string; file_size?: number }
  if (!meta.url || !/^https:\/\//.test(meta.url)) throw new CentralMetaError('media_url_missing', 502)
  if (Number(meta.file_size ?? 0) > MAX_AUDIO_BYTES) throw new CentralMetaError('media_too_large', 413)
  const response = await fetchImpl(meta.url, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new CentralMetaError(`central_media_http_${response.status}`, response.status)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_AUDIO_BYTES) throw new CentralMetaError('media_too_large', 413)
  return { bytes, mimeType: (meta.mime_type ?? 'audio/ogg').split(';')[0].trim() }
}
