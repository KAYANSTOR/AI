/**
 * Fill-only credential broker (خزنة الأسرار).
 *
 * Guarantees enforced here and by migration 0086:
 *  - a value is encrypted (AES-256-GCM, authenticated) before it is stored;
 *  - `save` returns metadata and an opaque `secret_ref` only — never the value;
 *  - `list` never selects the ciphertext column;
 *  - the plaintext is only ever produced inside a server-side callback
 *    (`withUserSecret`) so it can be handed to an outbound HTTP call. It is never
 *    returned to the browser and never placed in a model prompt.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { decryptSecret, encryptSecret } from '@/lib/credentials/service'

export const SECRET_KINDS = ['api_key', 'token', 'password', 'other'] as const
export type SecretKind = (typeof SECRET_KINDS)[number]

export type VaultOwner = { organizationId: string; userId: string }
export type VaultSecretMetadata = {
  secret_ref: string
  label: string
  secret_kind: SecretKind
  fingerprint: string
  status: 'active' | 'revoked'
  last_used_at: string | null
  created_at: string
  updated_at: string | null
}

const SECRET_REF_RE = /^sec_[a-f0-9]{32}$/
const METADATA_COLUMNS =
  'secret_ref, label, secret_kind, fingerprint, status, last_used_at, created_at, updated_at'

/** Explicit projection: even if a driver returns extra columns, ciphertext never leaves. */
function toMetadata(row: Record<string, unknown>): VaultSecretMetadata {
  return {
    secret_ref: String(row.secret_ref),
    label: String(row.label),
    secret_kind: normalizeSecretKind(row.secret_kind),
    fingerprint: String(row.fingerprint),
    status: row.status === 'revoked' ? 'revoked' : 'active',
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }
}

export function newSecretRef(): string {
  return 'sec_' + randomBytes(16).toString('hex')
}

export function isSecretRef(value: string): boolean {
  return SECRET_REF_RE.test(value)
}

/** Stable, non-reversible fingerprint shown in the UI so a user can recognise a value. */
export function fingerprintSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
}

export function normalizeSecretKind(value: unknown): SecretKind {
  return (SECRET_KINDS as readonly string[]).includes(String(value)) ? (String(value) as SecretKind) : 'other'
}

/** Stores a new secret. Returns metadata only — the caller must not expect the value back. */
export async function saveUserSecret(
  db: DbClient,
  owner: VaultOwner,
  input: { label: string; kind?: string; value: string }
): Promise<VaultSecretMetadata> {
  const label = String(input.label ?? '').trim().slice(0, 120)
  const value = String(input.value ?? '')
  if (!label) throw new Error('invalid_secret_label')
  if (!value.trim()) throw new Error('invalid_secret_value')
  if (value.length > 4096) throw new Error('secret_too_long')

  const row = {
    org_id: owner.organizationId,
    user_id: owner.userId,
    secret_ref: newSecretRef(),
    label,
    secret_kind: normalizeSecretKind(input.kind),
    ciphertext: encryptSecret(value),
    fingerprint: fingerprintSecret(value),
    status: 'active' as const,
  }
  const { data, error } = await db
    .from('user_secret_vault')
    .insert(row)
    .select(METADATA_COLUMNS)
    .single()
  if (error || !data) throw new Error('secret_save_failed')
  return toMetadata(data as Record<string, unknown>)
}

/** Metadata only. The ciphertext column is never requested. */
export async function listUserSecrets(db: DbClient, owner: VaultOwner): Promise<VaultSecretMetadata[]> {
  const { data, error } = await db
    .from('user_secret_vault')
    .select(METADATA_COLUMNS)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error('secret_list_failed')
  return (data ?? []).map((row) => toMetadata(row as Record<string, unknown>))
}

export async function revokeUserSecret(
  db: DbClient,
  owner: VaultOwner,
  secretRef: string
): Promise<boolean> {
  if (!isSecretRef(secretRef)) return false
  const { data, error } = await db
    .from('user_secret_vault')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('secret_ref', secretRef)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .select('id')
  if (error) throw new Error('secret_revoke_failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * Server-only resolution for the credential broker. Never expose the return value to
 * a model, a log line, an API response or a client component.
 */
export async function resolveUserSecret(
  db: DbClient,
  owner: VaultOwner,
  secretRef: string
): Promise<{ value: string } | null> {
  if (!isSecretRef(secretRef)) return null
  const { data, error } = await db
    .from('user_secret_vault')
    .select('ciphertext, status')
    .eq('secret_ref', secretRef)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error('secret_resolve_failed')
  if (!data?.ciphertext) return null
  return { value: decryptSecret(String(data.ciphertext)) }
}

/**
 * Runs an outbound operation with the decrypted secret. The callback receives the
 * plaintext; its result must never contain it. Usage is recorded for audit.
 */
export async function withUserSecret<T>(
  db: DbClient,
  owner: VaultOwner,
  secretRef: string,
  run: (value: string) => Promise<T>
): Promise<T> {
  const resolved = await resolveUserSecret(db, owner, secretRef)
  if (!resolved) throw new Error('secret_not_found')
  const result = await run(resolved.value)
  await db
    .from('user_secret_vault')
    .update({ last_used_at: new Date().toISOString() })
    .eq('secret_ref', secretRef)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
  return result
}
