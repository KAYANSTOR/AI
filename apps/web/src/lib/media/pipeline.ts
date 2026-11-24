import type { DbClient } from '@/lib/db/client'
import type { AiGuardPolicy } from '@/lib/billing/free-tier'
import { FREE_MEDIA_QUOTA_REPLY } from '@/lib/billing/free-tier'
import { isFastTextChannel } from '@/lib/ai/channel-format'
import { getConversationRef } from '@/lib/runtime/conversation'
import { isOwnerPauseActive } from '@/lib/runtime/owner-presence'
import {
  inboundGuards,
  processInboundMessage,
  storeInboundMessage,
  type InboundMessageType,
  type RuntimeChannel,
} from '@/lib/runtime/process-inbound'
import type { MediaAttachment, MediaSource } from './attachment'
import { audioAgentText, geminiMediaAnalyzer, imageAgentText, wrapDocumentText, type MediaAnalyzer } from './analyze'
import { MediaDownloadError, type DownloadedMedia } from './download'
import { inspectMediaBytes, MEDIA_REPLIES, preflightMedia, type MediaLimits } from './guard'

/**
 * Unified multimodal pipeline shared by every channel:
 * preflight (type/size/duration, no download) → plan gate → bounded download →
 * magic-byte/duration inspection → Gemini analysis → text for the agent.
 */
export type MediaDownloader = (source: MediaSource, maxBytes: number) => Promise<DownloadedMedia>

export type PreparedMedia =
  | { ok: true; kind: 'image' | 'audio' | 'document'; agentText: string; content: string; media: Record<string, unknown> }
  | { ok: false; code: string; reply: string; content: string; media: Record<string, unknown> }

const ANALYSIS_FAILED_REPLY = 'استلمنا رسالتك، لكن تعذر تحليل المرفق الآن. اكتب سؤالك نصاً وسنساعدك فوراً.'
const DOWNLOAD_FAILED_REPLY = 'استلمنا المرفق لكن تعذر تنزيله. أرسله مرة أخرى أو اكتب سؤالك نصاً.'

export function mediaLimitsFor(policy: AiGuardPolicy): MediaLimits {
  return { maxBytes: policy.mediaMaxBytes, maxAudioSeconds: policy.audioMaxSeconds, documentsAllowed: policy.documentsAllowed }
}

export function messageTypeFor(kind: MediaAttachment['kind']): Exclude<InboundMessageType, 'text'> {
  return kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : kind === 'video' ? 'video' : 'file'
}

export function mediaLabel(attachment: MediaAttachment): string {
  if (attachment.kind === 'audio') return attachment.voiceNote ? 'رسالة صوتية' : 'مقطع صوتي'
  if (attachment.kind === 'image') return attachment.caption ?? 'صورة'
  if (attachment.kind === 'video') return attachment.caption ?? 'مقطع فيديو'
  return attachment.fileName ?? 'ملف مرفق'
}

function baseMetadata(attachment: MediaAttachment): Record<string, unknown> {
  return {
    kind: attachment.kind,
    channel: attachment.channel,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    caption: attachment.caption,
    voiceNote: attachment.voiceNote,
    declaredBytes: attachment.declaredBytes,
    declaredSeconds: attachment.declaredSeconds,
  }
}

/** Validates, downloads and analyzes one attachment. No storage, no reply delivery. */
export async function prepareMedia(
  attachment: MediaAttachment,
  input: {
    policy: AiGuardPolicy
    channel: string
    analyzer: MediaAnalyzer
    download: MediaDownloader
    /** Plan gate between preflight and download (quota, flood). */
    beforeDownload?: () => Promise<{ ok: true } | { ok: false; code: string; reply: string }>
  }
): Promise<PreparedMedia> {
  const limits = mediaLimitsFor(input.policy)
  const meta = baseMetadata(attachment)
  const label = mediaLabel(attachment)
  const fail = (code: string, reply: string): PreparedMedia => ({ ok: false, code, reply, content: label, media: { ...meta, status: 'rejected', reason: code } })

  const preflight = preflightMedia(attachment, limits)
  if (!preflight.ok) return fail(preflight.code, preflight.reply)

  if (input.beforeDownload) {
    const gate = await input.beforeDownload()
    if (!gate.ok) return fail(gate.code, gate.reply)
  }

  let downloaded: DownloadedMedia
  try {
    downloaded = await input.download(attachment.source, limits.maxBytes)
  } catch (error) {
    if (error instanceof MediaDownloadError && error.tooLarge) {
      return fail('too_large', MEDIA_REPLIES.tooLarge(Math.round(limits.maxBytes / (1024 * 1024) * 10) / 10))
    }
    console.error('media_download_failed', { channel: attachment.channel, reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    return fail('download_failed', DOWNLOAD_FAILED_REPLY)
  }

  // Magic bytes decide the real type; a missing declared MIME (Messenger/Instagram) is sniffed here.
  const inspected = inspectMediaBytes(preflight, downloaded.bytes, limits, attachment.declaredSeconds)
  if (!inspected.ok) return fail(inspected.code, inspected.reply)

  const media = { bytes: downloaded.bytes, mimeType: inspected.mimeType }
  const details = { ...meta, mimeType: inspected.mimeType, bytes: downloaded.bytes.length, seconds: inspected.seconds }
  try {
    if (inspected.kind === 'audio') {
      const transcript = (await input.analyzer.transcribe(media)).trim().slice(0, 2000)
      if (!transcript) return fail('empty_transcript', 'لم نتمكن من سماع كلام واضح في الرسالة الصوتية. أعد إرسالها أو اكتب سؤالك نصاً.')
      return { ok: true, kind: 'audio', agentText: audioAgentText(transcript), content: transcript, media: { ...details, status: 'analyzed', transcript } }
    }
    if (inspected.kind === 'image') {
      const description = (await input.analyzer.describeImage(media, attachment.caption)).trim().slice(0, 600) || 'صورة بلا تفاصيل واضحة'
      return {
        ok: true, kind: 'image',
        agentText: imageAgentText(description, attachment.caption, isFastTextChannel(input.channel)),
        content: attachment.caption ? attachment.caption + '\n' + description : description,
        media: { ...details, status: 'analyzed', description },
      }
    }
    const raw = await input.analyzer.readDocument(media)
    const wrapped = wrapDocumentText(attachment.fileName, raw)
    if (!wrapped.excerpt) return fail('empty', MEDIA_REPLIES.empty)
    return {
      ok: true, kind: 'document', agentText: wrapped.text + (attachment.caption ? '\nسؤال العميل: ' + attachment.caption : ''),
      content: attachment.fileName ?? 'ملف مرفق',
      media: { ...details, status: 'analyzed', excerptChars: wrapped.excerpt.length, injectionFlagged: wrapped.flagged },
    }
  } catch (error) {
    console.error('media_analysis_failed', { channel: attachment.channel, kind: inspected.kind, reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    return fail('analysis_failed', ANALYSIS_FAILED_REPLY)
  }
}

type InboundIdentity = {
  organizationId: string
  businessId: string
  channelId: string
  channelType: RuntimeChannel
  provider: string
  externalEventId: string
  externalUserId?: string | null
  senderPhone?: string | null
  senderUsername?: string | null
  displayName?: string | null
}

export type InboundMediaResult = { reply: string | null; conversationId: string; contactId: string; status: string }

/**
 * Inbound media for every business channel: stores the message with media metadata for the
 * inbox, enforces the plan (documents, monthly media quota, flood), analyzes it and hands the
 * resulting text to the same agent runtime as a typed message.
 */
export async function handleInboundMedia(
  db: DbClient,
  input: InboundIdentity & { attachment: MediaAttachment },
  deps: { download: MediaDownloader; analyzer?: MediaAnalyzer }
): Promise<InboundMediaResult> {
  const guards = inboundGuards()
  const policy = await guards.policy(db, input.organizationId)
  const { attachment, ...identity } = input
  const stored = await storeInboundMessage(db, {
    ...identity,
    messageType: messageTypeFor(attachment.kind),
    content: mediaLabel(attachment),
    media: { ...baseMetadata(attachment), status: 'received' },
  })
  const base = { conversationId: stored.conversationId, contactId: stored.contactId }
  if (!stored.messageId) return { ...base, reply: null, status: 'duplicate' }

  const conversation = await getConversationRef(db, stored.conversationId, input.organizationId)
  const autoReply = Boolean(conversation?.aiEnabled) && conversation?.status !== 'handed_off' &&
    !(await isOwnerPauseActive(db, { channelId: input.channelId, conversationId: stored.conversationId }))
  if (!autoReply) return { ...base, reply: null, status: 'stored_for_human' }

  const prepared = await prepareMedia(attachment, {
    policy,
    channel: input.channelType,
    analyzer: deps.analyzer ?? geminiMediaAnalyzer({ economy: policy.economy }),
    download: deps.download,
    beforeDownload: async () => {
      const floodOk = await guards.consumeFlood(db, {
        organizationId: input.organizationId, contactId: stored.contactId,
        limit: policy.floodPerMinute, failClosed: policy.free,
      })
      if (!floodOk) return { ok: false, code: 'flood_limited', reply: '' }
      if (policy.free && policy.mediaMonthly) {
        const quota = await guards.consumeQuota(db, {
          organizationId: input.organizationId,
          fingerprints: await guards.fingerprints(db, { organizationId: input.organizationId, channelId: input.channelId }),
          kind: 'media', dailyLimit: null, monthlyLimit: policy.mediaMonthly,
        })
        if (!quota.allowed) return { ok: false, code: 'media_quota', reply: FREE_MEDIA_QUOTA_REPLY }
      }
      return { ok: true }
    },
  })

  await db.from('messages').update({ content: prepared.content, media: prepared.media }).eq('id', stored.messageId)
  if (!prepared.ok) {
    console.info('inbound_media_rejected', { organizationId: input.organizationId, channelId: input.channelId, code: prepared.code })
    return { ...base, reply: prepared.reply || null, status: prepared.code }
  }

  const result = await processInboundMessage(db, {
    ...identity,
    text: prepared.agentText,
    prestored: stored,
    floodChecked: true,
    policy,
  })
  return { ...result, status: 'analyzed' }
}
