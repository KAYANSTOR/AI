/**
 * Web (dashboard) personal-assistant guard: the same plan gates as every inbound
 * channel — per-user flood limit, free daily/monthly AI quota, input truncation and
 * the unified media pipeline for uploaded images/files and recorded voice notes.
 */
import type { DbClient } from '@/lib/db/client'
import { truncateForPlan, type AiGuardPolicy } from '@/lib/billing/free-tier'
import { inboundGuards, type InboundAiGuards } from '@/lib/runtime/process-inbound'
import type { MediaAttachment } from '@/lib/media/attachment'
import { prepareMedia, type MediaDownloader } from '@/lib/media/pipeline'
import { geminiMediaAnalyzer, type MediaAnalyzer } from '@/lib/media/analyze'
import { FREE_MEDIA_QUOTA_REPLY, FREE_QUOTA_REPLY } from '@/lib/billing/free-tier'

type Owner = { organizationId: string; userId: string }

export type AssistantTextGuard =
  | { ok: true; text: string }
  | { ok: false; status: 429 | 503; error: 'rate_limited' | 'free_quota_daily' | 'free_quota_monthly' | 'billing_check_failed'; reply?: string }

const inlineDownloader: MediaDownloader = async (source) => {
  if (source.type !== 'inline') throw new Error('unexpected_media_source')
  return { bytes: source.bytes, mimeType: null }
}

function subjectFor(owner: Owner): string {
  return 'user:' + owner.userId
}

async function consumeFlood(db: DbClient, owner: Owner, policy: AiGuardPolicy, guards: InboundAiGuards): Promise<boolean> {
  return guards.consumeFlood(db, { organizationId: owner.organizationId, contactId: subjectFor(owner), limit: policy.floodPerMinute, failClosed: policy.free })
}

async function consumeAiQuota(db: DbClient, owner: Owner, policy: AiGuardPolicy, guards: InboundAiGuards): Promise<AssistantTextGuard | null> {
  if (!policy.free) return null
  const decision = await guards.consumeQuota(db, {
    organizationId: owner.organizationId,
    fingerprints: await guards.fingerprints(db, { organizationId: owner.organizationId, channelId: '' }),
    kind: 'ai', dailyLimit: policy.dailyLimit, monthlyLimit: policy.monthlyLimit,
  })
  if (decision.allowed) return null
  if (decision.reason === 'unavailable') return { ok: false, status: 503, error: 'billing_check_failed' }
  return { ok: false, status: 429, error: decision.reason === 'daily' ? 'free_quota_daily' : 'free_quota_monthly', reply: FREE_QUOTA_REPLY }
}

/** Flood + free quota + truncation for one typed message. */
export async function guardAssistantText(
  db: DbClient,
  owner: Owner,
  text: string,
  deps: { policy: AiGuardPolicy; guards?: InboundAiGuards }
): Promise<AssistantTextGuard> {
  const guards = deps.guards ?? inboundGuards()
  if (!(await consumeFlood(db, owner, deps.policy, guards))) return { ok: false, status: 429, error: 'rate_limited' }
  const quota = await consumeAiQuota(db, owner, deps.policy, guards)
  if (quota) return quota
  return { ok: true, text: truncateForPlan(text, deps.policy) }
}

export type AssistantMediaResult = {
  status: 'replied' | string
  reply: string | null
  /** Thread text for the inbound entry (transcript / description / file name). */
  content: string
  media: Record<string, unknown>
  httpStatus: number
}

/** Validates, analyzes and answers one uploaded file or recorded voice note. */
export async function runAssistantMediaTurn(
  db: DbClient,
  owner: Owner,
  attachment: MediaAttachment,
  deps: { policy: AiGuardPolicy; runTurn: (text: string) => Promise<string>; guards?: InboundAiGuards; analyzer?: MediaAnalyzer }
): Promise<AssistantMediaResult> {
  const guards = deps.guards ?? inboundGuards()
  const policy = deps.policy
  const prepared = await prepareMedia(attachment, {
    policy,
    channel: 'web',
    analyzer: deps.analyzer ?? geminiMediaAnalyzer({ economy: policy.economy }),
    download: inlineDownloader,
    beforeDownload: async () => {
      if (!(await consumeFlood(db, owner, policy, guards))) return { ok: false, code: 'flood_limited', reply: 'رسائل كثيرة خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.' }
      if (policy.free && policy.mediaMonthly) {
        const quota = await guards.consumeQuota(db, {
          organizationId: owner.organizationId,
          fingerprints: await guards.fingerprints(db, { organizationId: owner.organizationId, channelId: '' }),
          kind: 'media', dailyLimit: null, monthlyLimit: policy.mediaMonthly,
        })
        if (!quota.allowed) return { ok: false, code: 'media_quota', reply: FREE_MEDIA_QUOTA_REPLY }
      }
      return { ok: true }
    },
  })
  if (!prepared.ok) {
    return { status: prepared.code, reply: prepared.reply || null, content: prepared.content, media: prepared.media, httpStatus: prepared.code === 'flood_limited' || prepared.code === 'media_quota' ? 429 : 422 }
  }
  const quota = await consumeAiQuota(db, owner, policy, guards)
  if (quota && !quota.ok) {
    return { status: quota.error, reply: quota.reply ?? null, content: prepared.content, media: prepared.media, httpStatus: quota.status }
  }
  const reply = await deps.runTurn(truncateForPlan(prepared.agentText, { maxInputChars: Math.max(policy.maxInputChars, 4600) }))
  return { status: 'replied', reply, content: prepared.content, media: prepared.media, httpStatus: 200 }
}
