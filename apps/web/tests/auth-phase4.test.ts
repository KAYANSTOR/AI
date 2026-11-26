import { describe, expect, it } from 'bun:test'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createOAuthState, isOAuthProvider, readOAuthState, sanitizeReturnTo } from '@/lib/auth/oauth/state'
import {
  buildAuthorizationUrl,
  getOAuthProviderConfig,
  pkceChallenge,
  verifyIdToken,
} from '@/lib/auth/oauth/providers'
import { resolveOAuthAccount, type OAuthAccountDeps } from '@/lib/auth/oauth/account'
import {
  consumeEmailToken,
  EMAIL_TOKEN_TTL_MS,
  hashEmailToken,
  issueEmailToken,
  type EmailTokenRow,
  type EmailTokenStore,
} from '@/lib/auth/email-tokens'
import { requestPasswordReset, PASSWORD_RESET_GENERIC_MESSAGE } from '@/lib/auth/password-recovery-flow'
import { renderPasswordResetEmail, renderVerifyEmail } from '@/lib/email/templates'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'

const SECRET = 'x'.repeat(48)
process.env.AUTH_SECRET = SECRET

function memoryTokenStore(): EmailTokenStore & { rows: EmailTokenRow[] } {
  const rows: EmailTokenRow[] = []
  return {
    rows,
    async insert(row) { rows.push({ ...row, usedAt: null }) },
    async invalidateOpen(userId, type, now) {
      for (const row of rows) if (row.userId === userId && row.type === type && !row.usedAt) row.usedAt = now
    },
    async consume(tokenHash, type, now) {
      const row = rows.find((r) => r.tokenHash === tokenHash && r.type === type && !r.usedAt && r.expiresAt > now)
      if (!row) return null
      row.usedAt = now
      return { userId: row.userId, email: row.email }
    },
  }
}

describe('OAuth state (CSRF + open redirect)', () => {
  it('round-trips a sealed state bound to the browser cookie', async () => {
    const created = await createOAuthState({ provider: 'google', mode: 'login', returnTo: '/dashboard/inbox' })
    const opened = await readOAuthState(created.state, created.binding, 'google')
    expect(opened?.returnTo).toBe('/dashboard/inbox')
    expect(opened?.nonce).toBe(created.nonce)
    expect(opened?.codeVerifier).toBe(created.codeVerifier)
  })

  it('rejects a tampered, foreign, or replayed-in-another-browser state', async () => {
    const created = await createOAuthState({ provider: 'google', mode: 'login', returnTo: '/dashboard' })
    expect(await readOAuthState(created.state + 'x', created.binding, 'google')).toBeNull()
    expect(await readOAuthState('not-a-state', created.binding, 'google')).toBeNull()
    expect(await readOAuthState(created.state, 'other-browser-binding', 'google')).toBeNull()
    expect(await readOAuthState(created.state, undefined, 'google')).toBeNull()
  })

  it('rejects an expired state', async () => {
    const past = Date.now() - 20 * 60 * 1000
    const created = await createOAuthState({ provider: 'google', mode: 'signup', returnTo: '/dashboard' }, past)
    expect(await readOAuthState(created.state, created.binding, 'google')).toBeNull()
  })

  it('never allows an external redirect target', () => {
    expect(sanitizeReturnTo('https://evil.example')).toBe('/dashboard')
    expect(sanitizeReturnTo('//evil.example')).toBe('/dashboard')
    expect(sanitizeReturnTo('/\\evil.example')).toBe('/dashboard')
    expect(sanitizeReturnTo('/%2F%2Fevil')).toBe('/dashboard')
    expect(sanitizeReturnTo('/dashboard/billing?tab=1')).toBe('/dashboard/billing?tab=1')
    expect(sanitizeReturnTo(undefined)).toBe('/dashboard')
  })
})

describe('OAuth providers', () => {
  it('reports unconfigured providers without throwing (build works without keys)', () => {
    expect(getOAuthProviderConfig('google', {})).toBeNull()
    expect(getOAuthProviderConfig('google', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })?.clientId).toBe('id')
  })

  it('builds a Google authorization URL with state, nonce and S256 PKCE', async () => {
    const config = getOAuthProviderConfig('google', { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 's' })!
    const url = new URL(buildAuthorizationUrl(config, {
      state: 'st', nonce: 'nn', codeChallenge: pkceChallenge('verifier-123'), redirectUri: 'https://kayan.test/api/auth/oauth/google/callback',
    }))
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('nonce')).toBe('nn')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
  })

  it('only accepts Google as an OAuth provider', () => {
    expect(isOAuthProvider('google')).toBe(true)
    for (const provider of ['github', 'facebook', 'unknown', '', null]) {
      expect(isOAuthProvider(provider)).toBe(false)
    }
  })

  it('verifies the id_token signature, audience, issuer and nonce', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
    const jwks = createLocalJWKSet({ keys: [jwk] })
    const config = getOAuthProviderConfig('google', { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 's' })!
    const sign = (claims: Record<string, unknown>, aud = 'cid') => new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com').setAudience(aud).setSubject('g-123')
      .setIssuedAt().setExpirationTime('5m').sign(privateKey)

    const good = await verifyIdToken(config, await sign({ nonce: 'n1', email: 'A@Gmail.com', email_verified: true }), 'n1', jwks)
    expect(good).toEqual({ provider: 'google', subject: 'g-123', email: 'a@gmail.com', emailVerified: true, name: null })
    expect(await verifyIdToken(config, await sign({ nonce: 'other', email: 'a@gmail.com', email_verified: true }), 'n1', jwks)).toBeNull()
    expect(await verifyIdToken(config, await sign({ nonce: 'n1' }, 'someone-else'), 'n1', jwks)).toBeNull()
    expect(await verifyIdToken(config, 'garbage', 'n1', jwks)).toBeNull()
  })
})

describe('OAuth account resolution', () => {
  function deps(overrides: Partial<OAuthAccountDeps> = {}) {
    const calls: string[] = []
    const base: OAuthAccountDeps = {
      findIdentityUserId: async () => null,
      findUserById: async () => null,
      findUserByEmail: async () => null,
      linkIdentity: async (userId) => { calls.push(`link:${userId}`) },
      markEmailVerified: async (userId) => { calls.push(`verify:${userId}`) },
      revokePasswordAndSessions: async (userId) => { calls.push(`revoke:${userId}`) },
      createOAuthUser: async (input) => { calls.push(`create:${input.email}`); return { id: 'new', email: input.email, sessionVersion: 0, bannedUntil: null, emailVerifiedAt: 'now' } },
      logEvent: async (event) => { calls.push(`log:${event}`) },
    }
    return { deps: { ...base, ...overrides }, calls }
  }
  const profile = { provider: 'google' as const, subject: 'g-1', email: 'a@gmail.com', emailVerified: true, name: 'Ali' }

  it('signs in an already linked identity', async () => {
    const user = { id: 'u1', email: 'a@gmail.com', sessionVersion: 2, bannedUntil: null, emailVerifiedAt: 'x' }
    const { deps: d, calls } = deps({ findIdentityUserId: async () => 'u1', findUserById: async () => user })
    const result = await resolveOAuthAccount(profile, d)
    expect(result).toEqual({ kind: 'login', user })
    expect(calls.some((c) => c.startsWith('create'))).toBe(false)
  })

  it('links a verified e-mail to the existing account and closes a pre-hijack window', async () => {
    const user = { id: 'u2', email: 'a@gmail.com', sessionVersion: 0, bannedUntil: null, emailVerifiedAt: null }
    const { deps: d, calls } = deps({ findUserByEmail: async () => user })
    const result = await resolveOAuthAccount(profile, d)
    expect(result.kind).toBe('linked')
    expect(calls).toContain('link:u2')
    expect(calls).toContain('verify:u2')
    expect(calls).toContain('revoke:u2')
  })

  it('does not reset the password of an already verified account when linking', async () => {
    const user = { id: 'u3', email: 'a@gmail.com', sessionVersion: 0, bannedUntil: null, emailVerifiedAt: '2026-01-01' }
    const { deps: d, calls } = deps({ findUserByEmail: async () => user })
    await resolveOAuthAccount(profile, d)
    expect(calls).toContain('link:u3')
    expect(calls.some((c) => c.startsWith('revoke'))).toBe(false)
  })

  it('refuses to link or create when the provider did not verify the e-mail', async () => {
    const { deps: d, calls } = deps({ findUserByEmail: async () => ({ id: 'u4', email: 'a@gmail.com', sessionVersion: 0, bannedUntil: null, emailVerifiedAt: null }) })
    const result = await resolveOAuthAccount({ ...profile, emailVerified: false }, d)
    expect(result).toEqual({ kind: 'error', code: 'email_unverified' })
    expect(calls.filter((c) => !c.startsWith('log'))).toEqual([])
  })

  it('creates a verified account and workspace for a new e-mail', async () => {
    const { deps: d, calls } = deps()
    const result = await resolveOAuthAccount(profile, d)
    expect(result.kind).toBe('created')
    expect(calls).toContain('create:a@gmail.com')
    expect(calls).toContain('link:new')
  })

  it('blocks suspended accounts', async () => {
    const user = { id: 'u5', email: 'a@gmail.com', sessionVersion: 0, bannedUntil: new Date(Date.now() + 86_400_000).toISOString(), emailVerifiedAt: 'x' }
    const { deps: d } = deps({ findIdentityUserId: async () => 'u5', findUserById: async () => user })
    expect(await resolveOAuthAccount(profile, d)).toEqual({ kind: 'error', code: 'suspended' })
  })
})

describe('single-use e-mail tokens', () => {
  it('stores only the SHA-256 hash and applies 24h / 30min lifetimes', async () => {
    const store = memoryTokenStore()
    const now = new Date('2026-11-24T10:00:00Z')
    const token = await issueEmailToken(store, { userId: 'u1', email: 'a@x.com', type: 'verify_email' }, now)
    expect(store.rows[0].tokenHash).toBe(hashEmailToken(token))
    expect(store.rows[0].tokenHash).not.toContain(token)
    expect(store.rows[0].expiresAt.getTime() - now.getTime()).toBe(EMAIL_TOKEN_TTL_MS.verify_email)
    expect(EMAIL_TOKEN_TTL_MS.verify_email).toBe(24 * 60 * 60 * 1000)
    expect(EMAIL_TOKEN_TTL_MS.reset_password).toBe(30 * 60 * 1000)
  })

  it('accepts a token once and rejects reuse', async () => {
    const store = memoryTokenStore()
    const token = await issueEmailToken(store, { userId: 'u1', email: 'a@x.com', type: 'reset_password' })
    expect(await consumeEmailToken(store, token, 'reset_password')).toEqual({ userId: 'u1', email: 'a@x.com' })
    expect(await consumeEmailToken(store, token, 'reset_password')).toBeNull()
  })

  it('rejects expired tokens, wrong types, malformed input and superseded tokens', async () => {
    const store = memoryTokenStore()
    const old = new Date(Date.now() - 31 * 60 * 1000)
    const expired = await issueEmailToken(store, { userId: 'u1', email: 'a@x.com', type: 'reset_password' }, old)
    expect(await consumeEmailToken(store, expired, 'reset_password')).toBeNull()

    const verify = await issueEmailToken(store, { userId: 'u1', email: 'a@x.com', type: 'verify_email' })
    expect(await consumeEmailToken(store, verify, 'reset_password')).toBeNull()
    expect(await consumeEmailToken(store, '', 'verify_email')).toBeNull()
    expect(await consumeEmailToken(store, 'x'.repeat(500), 'verify_email')).toBeNull()

    const first = await issueEmailToken(store, { userId: 'u2', email: 'b@x.com', type: 'verify_email' })
    await issueEmailToken(store, { userId: 'u2', email: 'b@x.com', type: 'verify_email' })
    expect(await consumeEmailToken(store, first, 'verify_email')).toBeNull()
  })
})

describe('password reset request (anti-enumeration)', () => {
  it('returns the same generic message whether the account exists or not', async () => {
    const sent: string[] = []
    const events: string[] = []
    const store = memoryTokenStore()
    const base = {
      store,
      sendEmail: async (to: string) => { sent.push(to) },
      logEvent: async (event: string) => { events.push(event) },
      resetUrl: (token: string) => `https://k.test/reset-password?token=${token}`,
    }
    const known = await requestPasswordReset('Known@x.com', { ...base, findUserByEmail: async () => ({ id: 'u1', email: 'known@x.com' }) })
    const unknown = await requestPasswordReset('ghost@x.com', { ...base, findUserByEmail: async () => null })
    expect(known).toEqual(unknown)
    expect(known.message).toBe(PASSWORD_RESET_GENERIC_MESSAGE)
    expect(sent).toEqual(['known@x.com'])
    expect(events).toContain('password_reset_requested')
    expect(store.rows).toHaveLength(1)
  })

  it('still answers generically when e-mail delivery fails', async () => {
    const store = memoryTokenStore()
    const result = await requestPasswordReset('a@x.com', {
      store,
      findUserByEmail: async () => ({ id: 'u1', email: 'a@x.com' }),
      sendEmail: async () => { throw new Error('resend down') },
      logEvent: async () => undefined,
      resetUrl: (t) => t,
    })
    expect(result.message).toBe(PASSWORD_RESET_GENERIC_MESSAGE)
    expect(store.rows[0].usedAt).not.toBeNull()
  })
})

describe('Resend e-mail service', () => {
  it('is a safe no-op when unconfigured', async () => {
    expect(isEmailConfigured({})).toBe(false)
    const result = await sendEmail({ to: 'a@x.com', subject: 's', html: '<p/>', text: 't' }, { env: {}, fetchImpl: async () => { throw new Error('must not call') } })
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
  })

  it('posts to the Resend API with the configured sender', async () => {
    let request: { url: string; init: RequestInit } | null = null
    const result = await sendEmail({ to: 'a@x.com', subject: 'مرحبا', html: '<p/>', text: 't' }, {
      env: { RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'KAYAN AI <no-reply@kayan.ai>' },
      fetchImpl: async (url, init) => { request = { url: String(url), init: init ?? {} }; return new Response('{"id":"1"}', { status: 200 }) },
    })
    expect(result).toEqual({ sent: true })
    expect(request!.url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(request!.init.body)).from).toBe('KAYAN AI <no-reply@kayan.ai>')
    expect((request!.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  })

  it('renders RTL Arabic templates in brand colours and escapes the link', () => {
    const verify = renderVerifyEmail({ url: 'https://k.test/verify-email?token=a"b<c' })
    expect(verify.html).toContain('dir="rtl"')
    expect(verify.html).toContain('#1F3B22')
    expect(verify.html).toContain('#D8E2D0')
    expect(verify.html).toContain('24 ساعة')
    expect(verify.html).not.toContain('a"b<c')
    const reset = renderPasswordResetEmail({ url: 'https://k.test/reset-password?token=t' })
    expect(reset.html).toContain('30 دقيقة')
    expect(reset.subject).toContain('كلمة المرور')
    for (const banned of ['#D9C7A3', '#B08D57', '#1F2A1F']) {
      expect(verify.html.toUpperCase()).not.toContain(banned)
      expect(reset.html.toUpperCase()).not.toContain(banned)
    }
  })
})
