import { describe, expect, it } from 'bun:test'
import { checkSignupGuards, emailDomain, isStaticDisposableDomain, SIGNUP_IP_LIMIT } from '@/lib/auth/signup-guard'

describe('signup anti-abuse guard', () => {
  it('extracts the normalized e-mail domain', () => {
    expect(emailDomain(' User@Mailinator.COM ')).toBe('mailinator.com')
    expect(emailDomain('no-at-sign')).toBe(null)
  })

  it('blocks disposable domains and their sub-domains statically', () => {
    expect(isStaticDisposableDomain('yopmail.com')).toBe(true)
    expect(isStaticDisposableDomain('x.mailinator.com')).toBe(true)
    expect(isStaticDisposableDomain('gmail.com')).toBe(false)
    expect(isStaticDisposableDomain('notmailinator.com')).toBe(false)
  })

  it('rejects a disposable e-mail before touching the IP counter', async () => {
    let ipCalls = 0
    const result = await checkSignupGuards({ email: 'a@10minutemail.com', ip: '1.2.3.4' }, {
      isBlockedDomain: async () => false,
      consumeIp: async () => { ipCalls += 1; return true },
    })
    expect(result).toEqual({ ok: false, reason: 'disposable_email' })
    expect(ipCalls).toBe(0)
  })

  it('consults the DB-managed blocklist', async () => {
    const result = await checkSignupGuards({ email: 'a@new-temp.example', ip: '1.2.3.4' }, {
      isBlockedDomain: async (domain) => domain === 'new-temp.example',
      consumeIp: async () => true,
    })
    expect(result).toEqual({ ok: false, reason: 'disposable_email' })
  })

  it('limits signups per IP through a hashed DB bucket', async () => {
    const seen: string[] = []
    let hits = 0
    const deps = {
      isBlockedDomain: async () => false,
      consumeIp: async (hash: string, limit: number) => { seen.push(hash); hits += 1; return hits <= limit },
    }
    const results = []
    for (let i = 0; i < SIGNUP_IP_LIMIT + 1; i += 1) results.push(await checkSignupGuards({ email: null, ip: '9.9.9.9' }, deps))
    expect(results.slice(0, SIGNUP_IP_LIMIT).every((r) => r.ok)).toBe(true)
    expect(results[SIGNUP_IP_LIMIT]).toEqual({ ok: false, reason: 'ip_rate_limited' })
    expect(seen[0]?.length).toBe(64)
    expect(seen[0]?.includes('9.9.9.9')).toBe(false)
  })

  it('fails closed when the DB counter is unavailable', async () => {
    const result = await checkSignupGuards({ email: 'a@gmail.com', ip: '1.1.1.1' }, {
      isBlockedDomain: async () => false,
      consumeIp: async () => { throw new Error('db down') },
    })
    expect(result).toEqual({ ok: false, reason: 'ip_rate_limited' })
  })
})
