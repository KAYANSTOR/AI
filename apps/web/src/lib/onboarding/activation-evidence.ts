import { createHash } from 'node:crypto'
import type { ReplyTestResult } from './reply-test'

/** A server-generated, short-lived proof of a real reply to the configured agent. */
export const ACTIVATION_EVIDENCE_TTL_MS = 10 * 60_000

export function activationFingerprint(input: {
  organizationId: string; businessId: string; agentId: string
  provider: string; model: string; locale: string; temperature: string
  system: string; name?: string
}): string {
  return createHash('sha256').update(JSON.stringify([
    'activation-v1', input.organizationId, input.businessId, input.agentId,
    input.provider, input.model, input.locale, input.temperature, input.name ?? '', input.system,
  ])).digest('hex')
}

export function readActivationEvidence(
  stored: unknown, fingerprint: string, now = Date.now()
): { reply: ReplyTestResult; testMessage: string; testedAt: string } | null {
  if (!stored || typeof stored !== 'object' || !fingerprint) return null
  const row = stored as Record<string, unknown>
  if (row.passed !== true || row.status !== 'passed' || row.fingerprint !== fingerprint) return null
  if (typeof row.testedAt !== 'string' || typeof row.testMessage !== 'string' || !row.testMessage.trim()) return null
  const age = now - Date.parse(row.testedAt)
  if (!Number.isFinite(age) || age < 0 || age > ACTIVATION_EVIDENCE_TTL_MS) return null
  const reply = row.reply as Partial<ReplyTestResult> | null
  if (!reply || reply.status !== 'answered' || typeof reply.reply !== 'string' || !reply.reply.trim()) return null
  return { reply: { status: 'answered', reply: reply.reply, message: 'الرد تم بنجاح' },
    testMessage: row.testMessage, testedAt: row.testedAt }
}
