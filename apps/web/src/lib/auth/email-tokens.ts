/**
 * Single-use e-mail tokens (verify_email: 24h, reset_password: 30min).
 * Only the SHA-256 hash is stored; consuming is one atomic UPDATE … WHERE used_at IS
 * NULL AND expires_at > now(), so a token works exactly once. Issuing a new token
 * closes the user's previous open tokens of the same type.
 */
import { createHash, randomBytes } from 'node:crypto'
import { getSql } from '@/lib/db/pool'

export type EmailTokenType = 'verify_email' | 'reset_password'

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
}

export type EmailTokenRow = {
  userId: string
  email: string
  type: EmailTokenType
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  usedAt: Date | null
}

export type EmailTokenStore = {
  insert: (row: Omit<EmailTokenRow, 'usedAt'>) => Promise<void>
  invalidateOpen: (userId: string, type: EmailTokenType, now: Date) => Promise<void>
  consume: (tokenHash: string, type: EmailTokenType, now: Date) => Promise<{ userId: string; email: string } | null>
}

export function hashEmailToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueEmailToken(
  store: EmailTokenStore,
  input: { userId: string; email: string; type: EmailTokenType },
  now = new Date()
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await store.invalidateOpen(input.userId, input.type, now)
  await store.insert({
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    type: input.type,
    tokenHash: hashEmailToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[input.type]),
  })
  return token
}

export async function consumeEmailToken(
  store: EmailTokenStore,
  token: unknown,
  type: EmailTokenType,
  now = new Date()
): Promise<{ userId: string; email: string } | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  return store.consume(hashEmailToken(token), type, now)
}

/** PostgreSQL-backed store (service connection; table is closed to anon/authenticated). */
export const pgEmailTokenStore: EmailTokenStore = {
  async insert(row) {
    await getSql().unsafe(
      `insert into public.auth_email_tokens (user_id, token_type, token_hash, email, created_at, expires_at)
       values ($1::uuid, $2, $3, $4, $5, $6)`,
      [row.userId, row.type, row.tokenHash, row.email, row.createdAt, row.expiresAt]
    )
  },
  async invalidateOpen(userId, type, now) {
    await getSql().unsafe(
      'update public.auth_email_tokens set used_at = $3 where user_id = $1::uuid and token_type = $2 and used_at is null',
      [userId, type, now]
    )
  },
  async consume(tokenHash, type, now) {
    const rows = await getSql().unsafe<{ user_id: string; email: string }[]>(
      `update public.auth_email_tokens
          set used_at = $3
        where token_hash = $1 and token_type = $2 and used_at is null and expires_at > $3
        returning user_id::text as user_id, email`,
      [tokenHash, type, now]
    )
    return rows[0] ? { userId: rows[0].user_id, email: rows[0].email } : null
  },
}
