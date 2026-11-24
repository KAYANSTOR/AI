/** Auth security log: hashed identifiers only, never raw IPs, e-mails or tokens. */
import { createHash } from 'node:crypto'
import { getSql } from '@/lib/db/pool'

export function hashIdentifier(kind: 'ip' | 'email', value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  return createHash('sha256').update(`kayan-auth-${kind}:v1:${normalized}`).digest('hex')
}

export async function logSecurityEvent(input: {
  event: string
  userId?: string | null
  ip?: string | null
  email?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await getSql().unsafe(
      `insert into public.auth_security_events (user_id, event_type, ip_hash, email_hash, metadata)
       values ($1::uuid, $2, $3, $4, $5::text::jsonb)`,
      [input.userId ?? null, input.event, hashIdentifier('ip', input.ip), hashIdentifier('email', input.email), JSON.stringify(input.metadata ?? {})]
    )
  } catch (error) {
    console.error('auth_security_event_failed', { event: input.event, reason: String((error as Error)?.message ?? '').slice(0, 120) })
  }
}
