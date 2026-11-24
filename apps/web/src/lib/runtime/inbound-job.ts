import type { DbClient } from '@/lib/db/client'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import type { MediaAttachment } from '@/lib/media/attachment'
import { handleInboundMedia, type MediaDownloader } from '@/lib/media/pipeline'
import { downloaderForChannel } from '@/lib/media/channel-downloader'
import type { MediaAnalyzer } from '@/lib/media/analyze'

export type InboundPayload = {
  channelId: string
  organizationId: string
  businessId: string
  externalEventId: string
  senderJid: string
  senderPhone?: string | null
  displayName?: string | null
  text: string
  providerAccountId?: string | null
  externalIdentifier?: string | null
  /** Queued by the owner-presence sweep after the owner's pause expired. */
  catchUp?: boolean
  conversationId?: string
  /** Unified attachment (WhatsApp QR / Cloud); bytes are fetched only after the guards. */
  media?: MediaAttachment | null
  provider?: string
  /** Cloud API: same identity keys as the synchronous text path. */
  externalUserId?: string | null
  contactPhone?: string | null
}

/** Runs one queued WhatsApp turn (text or media) through the shared runtime. */
export async function runInboundJobTurn(
  db: DbClient,
  input: InboundPayload,
  deps: { download?: MediaDownloader; analyzer?: MediaAnalyzer } = {}
): Promise<{ reply: string | null; conversationId: string }> {
  const identity = {
    organizationId: input.organizationId,
    businessId: input.businessId,
    channelId: input.channelId,
    channelType: 'whatsapp' as const,
    provider: input.provider ?? 'whatsapp',
    externalEventId: input.externalEventId,
    externalUserId: input.externalUserId || input.senderPhone || input.senderJid,
    senderPhone: input.contactPhone || input.senderPhone || null,
    displayName: input.displayName || null,
  }
  if (input.media && input.media.source?.type !== 'inline') {
    const download = deps.download ?? downloaderForChannel(db, {
      id: input.channelId,
      organizationId: input.organizationId,
      businessId: input.businessId,
      channelType: 'whatsapp',
      providerAccountId: input.providerAccountId || null,
      externalIdentifier: input.externalIdentifier || null,
    })
    return handleInboundMedia(db, { ...identity, attachment: input.media }, { download, analyzer: deps.analyzer })
  }
  return processInboundMessage(db, { ...identity, text: input.text })
}
