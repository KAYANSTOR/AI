import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { getOrganizationPlanLimits } from '@/lib/billing/entitlements'
import type { PlanLimits } from '@/lib/billing/plan-catalog'

/**
 * Fair-use policy for AI replies and media, derived from the plan limits stored in
 * `plans.limits` (editable from owner-console). The free plan (`trial`) gets hard
 * daily/monthly/media caps tracked per phone fingerprint so deleting the account and
 * signing up again with the same number does not reset the free quota.
 */
export type AiGuardPolicy = {
  planCode: string
  free: boolean
  dailyLimit: number | null
  monthlyLimit: number
  mediaMonthly: number | null
  mediaMaxBytes: number
  audioMaxSeconds: number
  documentsAllowed: boolean
  maxInputChars: number
  maxOutputTokens: number | null
  floodPerMinute: number
  /** Cheapest fast model only. */
  economy: boolean
}

const MB = 1024 * 1024
const FREE_CODES = new Set(['trial', 'free', 'basic'])

function num(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function optionalNum(value: unknown, fallback: number | null): number | null {
  if (value === null) return null
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function isFreePlanCode(planCode: string): boolean {
  return FREE_CODES.has(planCode.trim().toLowerCase())
}

export function aiGuardPolicyFor(planCode: string, limits: Partial<PlanLimits>): AiGuardPolicy {
  const free = isFreePlanCode(planCode)
  return {
    planCode,
    free,
    dailyLimit: optionalNum(limits.ai_messages_daily, free ? 10 : null),
    monthlyLimit: num(limits.ai_messages, free ? 40 : 1000),
    mediaMonthly: optionalNum(limits.media_monthly, free ? 5 : null),
    mediaMaxBytes: Math.round(num(limits.media_max_mb, free ? 2 : 5) * MB),
    audioMaxSeconds: num(limits.audio_max_seconds, free ? 30 : 60),
    documentsAllowed: num(limits.document_analysis, free ? 0 : 1) > 0,
    maxInputChars: Math.max(50, num(limits.max_input_chars, free ? 500 : 2000)),
    maxOutputTokens: optionalNum(limits.max_output_tokens, free ? 180 : null),
    floodPerMinute: Math.max(1, num(limits.flood_per_minute, 4)),
    economy: free,
  }
}

export async function getAiGuardPolicy(db: DbClient, organizationId: string): Promise<AiGuardPolicy> {
  const { planCode, limits } = await getOrganizationPlanLimits(db, organizationId)
  return aiGuardPolicyFor(planCode, limits)
}

/** Stable SHA-256 fingerprint of a phone/WhatsApp number or channel identifier. */
export function quotaFingerprint(value: string): string | null {
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  const normalized = digits.length >= 7 && digits.length <= 15 && /^[+\d\s()-]+$/.test(raw) ? 'phone:' + digits : 'id:' + raw
  return createHash('sha256').update('kayan-free-quota:v1:' + normalized).digest('hex')
}

export type QuotaKind = 'ai' | 'media'
export type QuotaDecision = { allowed: true } | { allowed: false; reason: 'daily' | 'monthly' | 'media' | 'unavailable' }

/**
 * Atomically consumes one unit for the organization and every fingerprint. Fails closed:
 * if the database cannot confirm the quota the free plan does not call the model.
 */
export async function consumeFreeQuota(
  db: DbClient,
  input: { organizationId: string; fingerprints: string[]; kind: QuotaKind; dailyLimit: number | null; monthlyLimit: number }
): Promise<QuotaDecision> {
  const { data, error } = await db.rpc('consume_free_tier_quota', {
    p_organization_id: input.organizationId,
    p_fingerprints: [...new Set(input.fingerprints)].slice(0, 5),
    p_kind: input.kind,
    p_daily_limit: input.dailyLimit ?? 0,
    p_monthly_limit: input.monthlyLimit,
  })
  if (error) {
    console.error('free_quota_check_failed', { reason: error.message.slice(0, 120) })
    return { allowed: false, reason: 'unavailable' }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reason?: string | null } | null
  if (row?.allowed) return { allowed: true }
  const reason = row?.reason === 'daily' || row?.reason === 'media' ? row.reason : 'monthly'
  return { allowed: false, reason }
}

/** Anti-flood: max N AI calls per minute per contact, shared by every replica. */
export async function consumeContactFlood(
  db: DbClient,
  input: { organizationId: string; contactId: string; limit: number; failClosed: boolean }
): Promise<boolean> {
  const { data, error } = await db.rpc('consume_ai_rate_limit', {
    p_scope: 'contact',
    p_subject_id: input.organizationId + ':' + input.contactId,
    p_limit: input.limit,
    p_window_seconds: 60,
  })
  if (error) {
    console.error('contact_flood_check_failed', { reason: error.message.slice(0, 120) })
    return !input.failClosed
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | null
  return Boolean(row?.allowed)
}

/** Fingerprints for the free quota: the channel's number/identifier and the owner's phone. */
export async function freeQuotaFingerprints(
  db: DbClient,
  input: { organizationId: string; channelId?: string | null; ownerPhone?: string | null }
): Promise<string[]> {
  const values: string[] = ['org:' + input.organizationId]
  if (input.channelId) {
    const { data } = await db.from('channels').select('channel_type, external_identifier, provider_account_id')
      .eq('id', input.channelId).eq('organization_id', input.organizationId).maybeSingle()
    const row = data as { channel_type?: string; external_identifier?: string | null; provider_account_id?: string | null } | null
    if (row?.external_identifier) values.push(String(row.external_identifier))
    else if (row?.provider_account_id) values.push(String(row.channel_type ?? '') + ':' + String(row.provider_account_id))
  }
  if (input.ownerPhone) values.push(input.ownerPhone)
  return values.map(quotaFingerprint).filter((value): value is string => Boolean(value))
}

export function truncateForPlan(text: string, policy: Pick<AiGuardPolicy, 'maxInputChars'>): string {
  return text.length > policy.maxInputChars ? text.slice(0, policy.maxInputChars) : text
}

export const FREE_QUOTA_REPLY = 'نعتذر، تم استهلاك حصة الردود الذكية لهذه الفترة. سيتابع أحد أعضاء الفريق قريبًا.'
export const FREE_DOCUMENT_REPLY = 'شكراً لإرسال الملف. تحليل الملفات متاح في الباقات المدفوعة فقط، ويمكنك كتابة سؤالك نصاً وسنساعدك فوراً.'
export const FREE_MEDIA_QUOTA_REPLY = 'شكراً لك. تم استهلاك حصة تحليل الصور والصوت لهذا الشهر، اكتب سؤالك نصاً وسنساعدك فوراً.'
