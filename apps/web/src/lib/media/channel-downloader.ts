import type { DbClient } from '@/lib/db/client'
import { loadChannelCredentials } from '@/lib/credentials/service'
import { gatewayConfiguration } from '@/lib/providers/whatsapp-gateway'
import { resolveOwnedChannelCredentials, type OutboundChannel } from '@/lib/runtime/outbound'
import { downloadMediaSource, type MediaDownloadContext } from './download'
import type { MediaDownloader } from './pipeline'

/**
 * Per-channel downloader. Credentials are resolved lazily, only after the preflight and
 * plan checks passed, and always for the tenant's own channel (never the central bot).
 */
export function downloaderForChannel(db: DbClient, channel: OutboundChannel): MediaDownloader {
  return async (source, maxBytes) => {
    const context: MediaDownloadContext = { maxBytes }
    if (source.type === 'meta_cloud') {
      const credentials = await resolveOwnedChannelCredentials(channel)
      context.metaAccessToken = credentials.access_token
    } else if (source.type === 'telegram') {
      context.telegramBotToken = (await loadChannelCredentials(db, channel.id, 'telegram')).bot_token
    } else if (source.type === 'baileys') {
      context.gateway = gatewayConfiguration()
    }
    return downloadMediaSource(source, context)
  }
}
