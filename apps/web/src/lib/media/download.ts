import type { MediaSource } from './attachment'

/**
 * Bounded media download: the declared Content-Length is checked before reading and the
 * body is streamed with a hard byte cap, so an oversized file is never fully loaded.
 */
export type FetchLike = typeof fetch
export type DownloadedMedia = { bytes: Buffer; mimeType: string | null }

export class MediaDownloadError extends Error {
  constructor(message: string, readonly tooLarge = false) {
    super(message)
    this.name = 'MediaDownloadError'
  }
}

export async function boundedFetch(
  url: string,
  init: RequestInit,
  maxBytes: number,
  fetchImpl: FetchLike = fetch
): Promise<DownloadedMedia> {
  if (!/^https?:\/\//i.test(url)) throw new MediaDownloadError('media_url_invalid')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetchImpl(url, { ...init, redirect: 'follow', signal: controller.signal })
    if (!response.ok) throw new MediaDownloadError('media_http_' + response.status)
    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > maxBytes) {
      controller.abort()
      throw new MediaDownloadError('media_too_large', true)
    }
    const mimeType = response.headers.get('content-type')
    if (!response.body) {
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > maxBytes) throw new MediaDownloadError('media_too_large', true)
      return { bytes, mimeType }
    }
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        controller.abort()
        throw new MediaDownloadError('media_too_large', true)
      }
      chunks.push(Buffer.from(value))
    }
    return { bytes: Buffer.concat(chunks), mimeType }
  } finally {
    clearTimeout(timer)
  }
}

export type MediaDownloadContext = {
  maxBytes: number
  /** Meta Cloud access token of the tenant's own WhatsApp number. */
  metaAccessToken?: string
  metaGraphBaseUrl?: string
  telegramBotToken?: string
  gateway?: { baseUrl: string; token: string }
  fetchImpl?: FetchLike
}

/** Downloads the bytes for any `MediaSource` (re-checking the provider's declared size first). */
export async function downloadMediaSource(source: MediaSource, context: MediaDownloadContext): Promise<DownloadedMedia> {
  const fetchImpl = context.fetchImpl ?? fetch
  const max = context.maxBytes
  if (source.type === 'inline') {
    if (source.bytes.length > max) throw new MediaDownloadError('media_too_large', true)
    return { bytes: source.bytes, mimeType: null }
  }
  if (source.type === 'meta_cloud') {
    if (!/^[0-9A-Za-z_-]{1,128}$/.test(source.mediaId)) throw new MediaDownloadError('invalid_media_id')
    if (!context.metaAccessToken) throw new MediaDownloadError('meta_credentials_missing')
    const base = (context.metaGraphBaseUrl ?? process.env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v21.0').replace(/\/+$/, '')
    const auth = { Authorization: 'Bearer ' + context.metaAccessToken }
    const metaResponse = await fetchImpl(base + '/' + encodeURIComponent(source.mediaId), { headers: auth, signal: AbortSignal.timeout(15_000) })
    if (!metaResponse.ok) throw new MediaDownloadError('meta_media_lookup_' + metaResponse.status)
    const meta = await metaResponse.json() as { url?: string; mime_type?: string; file_size?: number }
    if (Number(meta.file_size ?? 0) > max) throw new MediaDownloadError('media_too_large', true)
    if (!meta.url || !/^https:\/\//.test(meta.url)) throw new MediaDownloadError('media_url_missing')
    const downloaded = await boundedFetch(meta.url, { headers: auth }, max, fetchImpl)
    return { bytes: downloaded.bytes, mimeType: meta.mime_type ?? downloaded.mimeType }
  }
  if (source.type === 'telegram') {
    if (!context.telegramBotToken) throw new MediaDownloadError('telegram_credentials_missing')
    const api = 'https://api.telegram.org/bot' + context.telegramBotToken
    const fileResponse = await fetchImpl(api + '/getFile?file_id=' + encodeURIComponent(source.fileId), { signal: AbortSignal.timeout(15_000) })
    const file = await fileResponse.json().catch(() => null) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null
    if (!fileResponse.ok || !file?.ok || !file.result?.file_path) throw new MediaDownloadError('telegram_file_lookup_failed')
    if (Number(file.result.file_size ?? 0) > max) throw new MediaDownloadError('media_too_large', true)
    return boundedFetch('https://api.telegram.org/file/bot' + context.telegramBotToken + '/' + file.result.file_path, {}, max, fetchImpl)
  }
  if (source.type === 'baileys') {
    if (!context.gateway) throw new MediaDownloadError('gateway_unavailable')
    const url = context.gateway.baseUrl + '/sessions/' + encodeURIComponent(source.channelId) + '/media/' +
      encodeURIComponent(source.messageId) + '?maxBytes=' + max
    return boundedFetch(url, { headers: { authorization: 'Bearer ' + context.gateway.token } }, max, fetchImpl)
  }
  return boundedFetch(source.url, {}, max, fetchImpl)
}
