/**
 * Signup anti-abuse (Phase 3C): disposable e-mail domains are refused and signups are
 * rate-limited per client IP through a PostgreSQL bucket shared by every replica.
 * The IP is stored only as a SHA-256 hash.
 */
import { createHash } from 'node:crypto'
import { getSql } from '@/lib/db/pool'

export const SIGNUP_IP_LIMIT = 5
export const SIGNUP_IP_WINDOW_SECONDS = 3600

const STATIC_DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com',
  '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com',
  'yopmail.com', 'yopmail.net', 'getnada.com', 'trashmail.com', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'moakt.com', 'tempr.email',
  'discard.email', 'mailnesia.com', 'spamgourmet.com', 'burnermail.io', '1secmail.com', 'emailfake.com',
  'temp-mail.io',
])

export type SignupGuardDeps = {
  isBlockedDomain: (domain: string) => Promise<boolean>
  consumeIp: (ipHash: string, limit: number, windowSeconds: number) => Promise<boolean>
}

export type SignupGuardResult = { ok: true } | { ok: false; reason: 'disposable_email' | 'ip_rate_limited' }

export function emailDomain(email: string | null | undefined): string | null {
  const value = String(email ?? '').trim().toLowerCase()
  const at = value.lastIndexOf('@')
  if (at < 1 || at === value.length - 1) return null
  return value.slice(at + 1)
}

/** Parent domains, most specific first: a.b.example.com -> [a.b.example.com, b.example.com, example.com]. */
function domainChain(domain: string): string[] {
  const parts = domain.split('.').filter(Boolean)
  const chain: string[] = []
  for (let i = 0; i < parts.length - 1; i += 1) chain.push(parts.slice(i).join('.'))
  return chain
}

export function isStaticDisposableDomain(domain: string): boolean {
  return domainChain(domain.toLowerCase()).some((candidate) => STATIC_DISPOSABLE_DOMAINS.has(candidate))
}

export function hashSignupIp(ip: string): string {
  return createHash('sha256').update('kayan-signup-ip:v1:' + ip.trim().toLowerCase()).digest('hex')
}

export async function checkSignupGuards(
  input: { email: string | null; ip: string },
  deps: SignupGuardDeps = defaultSignupGuardDeps
): Promise<SignupGuardResult> {
  const domain = emailDomain(input.email)
  if (domain) {
    if (isStaticDisposableDomain(domain)) return { ok: false, reason: 'disposable_email' }
    let blocked = false
    try {
      for (const candidate of domainChain(domain)) {
        if (await deps.isBlockedDomain(candidate)) { blocked = true; break }
      }
    } catch (error) {
      // The static list above still applies; a missing table must not block every signup.
      console.error('blocked_email_domains_lookup_failed', { reason: String((error as Error)?.message ?? '').slice(0, 120) })
    }
    if (blocked) return { ok: false, reason: 'disposable_email' }
  }
  try {
    const allowed = await deps.consumeIp(hashSignupIp(input.ip || 'unknown'), SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_SECONDS)
    return allowed ? { ok: true } : { ok: false, reason: 'ip_rate_limited' }
  } catch (error) {
    console.error('signup_ip_limit_failed', { reason: String((error as Error)?.message ?? '').slice(0, 120) })
    return { ok: false, reason: 'ip_rate_limited' }
  }
}

export const defaultSignupGuardDeps: SignupGuardDeps = {
  async isBlockedDomain(domain) {
    const rows = await getSql().unsafe<{ found: number }[]>(
      'select 1 as found from public.blocked_email_domains where domain = $1 limit 1', [domain])
    return rows.length > 0
  },
  async consumeIp(ipHash, limit, windowSeconds) {
    const rows = await getSql().unsafe<{ allowed: boolean }[]>(
      "select allowed from public.consume_ai_rate_limit('signup_ip', $1, $2, $3)", [ipHash, limit, windowSeconds])
    return Boolean(rows[0]?.allowed)
  },
}
