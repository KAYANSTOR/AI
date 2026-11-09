/**
 * Account storage. Users live in `auth.users`; the database trigger
 * `on_auth_user_created` provisions the organization, owner membership, business
 * profile and default hours when a row is inserted — exactly as before.
 */
import { getSql } from '@/lib/db/pool'
import { hashPassword } from './password'

export type AuthUser = {
  id: string
  email: string
  encryptedPassword: string | null
  sessionVersion: number
  bannedUntil: string | null
  userMetadata: Record<string, unknown>
}

type UserRow = {
  id: string
  email: string
  encrypted_password: string | null
  session_version: number
  banned_until: string | null
  raw_user_meta_data: Record<string, unknown> | null
}

function mapUser(row: UserRow | undefined): AuthUser | null {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    encryptedPassword: row.encrypted_password,
    sessionVersion: row.session_version ?? 0,
    bannedUntil: row.banned_until,
    userMetadata: row.raw_user_meta_data ?? {},
  }
}

const USER_COLUMNS = 'id, email, encrypted_password, session_version, banned_until::text as banned_until, raw_user_meta_data'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await getSql().unsafe<UserRow[]>(
    `select ${USER_COLUMNS} from auth.users where lower(email) = $1 and deleted_at is null limit 1`,
    [normalizeEmail(email)]
  )
  return mapUser(rows[0])
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const rows = await getSql().unsafe<UserRow[]>(
    `select ${USER_COLUMNS} from auth.users where id = $1::uuid and deleted_at is null limit 1`,
    [id]
  )
  return mapUser(rows[0])
}

export async function createUser(input: {
  email: string
  password: string
  metadata: Record<string, unknown>
}): Promise<AuthUser> {
  const hash = await hashPassword(input.password)
  const rows = await getSql().unsafe<UserRow[]>(
    `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::text::jsonb)
     returning ${USER_COLUMNS}`,
    [normalizeEmail(input.email), hash, JSON.stringify(input.metadata)]
  )
  return mapUser(rows[0])!
}

export async function recordSignIn(id: string): Promise<void> {
  await getSql().unsafe(`update auth.users set last_sign_in_at = now() where id = $1::uuid`, [id])
}

/** Sets a new password and invalidates every existing session for the account. */
export async function setPassword(id: string, password: string): Promise<number> {
  const hash = await hashPassword(password)
  const rows = await getSql().unsafe<{ session_version: number }[]>(
    `update auth.users
        set encrypted_password = $2, session_version = session_version + 1, updated_at = now()
      where id = $1::uuid
      returning session_version`,
    [id, hash]
  )
  return rows[0]?.session_version ?? 0
}
