/**
 * CredentialService — the single place provider credentials are encrypted, decrypted,
 * redacted and looked up.
 *
 * Server-only by construction: this module imports `node:crypto`, so it cannot be
 * bundled into a client component, and the `provider_credentials` table has no client
 * policy or grant (migration 0012). Callers must pass a server client.
 *
 * Design rules enforced here:
 *  - One abstraction. Providers receive credentials as arguments; nothing else reads
 *    provider environment variables directly for per-tenant work.
 *  - Encryption is real AES-256-GCM with a 96-bit IV and an authentication tag, so a
 *    tampered ciphertext fails to decrypt instead of returning garbage.
 *  - A missing/invalid CREDENTIAL_ENCRYPTION_KEY is a hard configuration failure. There
 *    is no plaintext fallback and no placeholder key.
 *  - Values are never returned to a browser: the dashboard reads metadata only.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CREDENTIAL_KEY_ENV, type CredentialMetadata } from '@/lib/credentials/catalog'

// The catalogue lives in catalog.ts so client components can render credential fields
// without importing this server-only module (and its node:crypto dependency).
export { CREDENTIAL_KEY_ENV, CHANNEL_CREDENTIAL_FIELDS, PROVIDER_FOR_CHANNEL, isCredentialField } from '@/lib/credentials/catalog'
export type { CredentialField, CredentialMetadata } from '@/lib/credentials/catalog'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const PAYLOAD_VERSION = 'v1'

/** Raised when the platform is not configured to store credentials at all. */
export class CredentialConfigError extends Error {
  readonly code = 'credential_config_error'
  constructor(message: string) {
    super(message)
    this.name = 'CredentialConfigError'
  }
}

/** Raised when a channel has no credential for an operation that needs one. */
export class CredentialMissingError extends Error {
  readonly code = 'credential_missing'
  constructor(provider: string, credentialType: string) {
    super(
      `لا توجد بيانات اعتماد مُهيّأة (${provider}/${credentialType}). أضفها من صفحة القنوات قبل التشغيل.`
    )
    this.name = 'CredentialMissingError'
  }
}

function encryptionKey(): Buffer {
  const raw = process.env[CREDENTIAL_KEY_ENV]?.trim()
  if (!raw) {
    throw new CredentialConfigError(
      `${CREDENTIAL_KEY_ENV} is not set. Provider credentials cannot be stored or read until it is configured. ` +
        'Generate 32 random bytes and keep them only in the server environment.'
    )
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new CredentialConfigError(
      `${CREDENTIAL_KEY_ENV} must decode to exactly 32 bytes (base64 or 64-char hex); got ${key.length}.`
    )
  }
  return key
}

/** True when the platform can store credentials; used to render an honest setup state. */
export function credentialsStorageConfigured(): boolean {
  try {
    encryptionKey()
    return true
  } catch {
    return false
  }
}

export function encryptSecret(plaintext: string, keyVersion = 1): string {
  const key = encryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PAYLOAD_VERSION, keyVersion, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    ':'
  )
}

export function decryptSecret(payload: string): string {
  const key = encryptionKey()
  const parts = payload.split(':')
  if (parts.length !== 5 || parts[0] !== PAYLOAD_VERSION) {
    throw new CredentialConfigError('Stored credential has an unrecognised format; it cannot be decrypted.')
  }
  const iv = Buffer.from(parts[2], 'base64')
  const tag = Buffer.from(parts[3], 'base64')
  const ciphertext = Buffer.from(parts[4], 'base64')
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new CredentialConfigError('Stored credential is malformed; it cannot be decrypted.')
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  // A wrong key or a tampered value throws here rather than returning partial data.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Constant-time comparison for secrets we must compare (e.g. verify tokens). */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Never log or display a credential. Shows only a stable fingerprint and the last
 * characters, which is enough to answer "is this the key I think it is?".
 */
export function redactSecret(value: string | null | undefined): string {
  if (!value) return '—'
  const visible = value.length >= 4 ? value.slice(-4) : ''
  return '••••' + visible
}

// ── Storage operations ─────────────────────────────────────────────────────────

/** Metadata only — deliberately never selects encrypted_value. */
export async function listCredentialMetadata(
  supabase: SupabaseClient,
  organizationId: string
): Promise<CredentialMetadata[]> {
  const { data, error } = await supabase.rpc('list_channel_credential_metadata', {
    p_organization_id: organizationId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as CredentialMetadata[]
}

export async function saveChannelCredential(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    channelId: string
    provider: string
    credentialType: string
    value: string
    status?: string
  }
): Promise<void> {
  // Encryption happens before the value reaches any storage layer.
  const encryptedValue = encryptSecret(input.value)
  const { error } = await supabase.from('provider_credentials').upsert(
    {
      organization_id: input.organizationId,
      channel_id: input.channelId,
      provider: input.provider,
      credential_type: input.credentialType,
      encrypted_value: encryptedValue,
      status: input.status ?? 'active',
      key_version: 1,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'channel_id,provider,credential_type' }
  )
  if (error) throw new Error(error.message)
}

export async function setChannelCredentialStatus(
  supabase: SupabaseClient,
  input: { channelId: string; provider: string; status: 'active' | 'disabled' }
): Promise<void> {
  const { error } = await supabase
    .from('provider_credentials')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('channel_id', input.channelId)
    .eq('provider', input.provider)
  if (error) throw new Error(error.message)
}

export async function deleteChannelCredential(
  supabase: SupabaseClient,
  input: { channelId: string; provider: string; credentialType?: string }
): Promise<void> {
  let query = supabase.from('provider_credentials').delete().eq('channel_id', input.channelId).eq('provider', input.provider)
  if (input.credentialType) query = query.eq('credential_type', input.credentialType)
  const { error } = await query
  if (error) throw new Error(error.message)
}

/**
 * Decrypted, provider-shaped lookup for one channel.
 *
 * Returns an empty object when nothing is configured so the caller decides how to fail;
 * callers that cannot proceed should raise CredentialMissingError via `requireCredential`.
 */
export async function loadChannelCredentials(
  supabase: SupabaseClient,
  channelId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('provider_credentials')
    .select('credential_type, encrypted_value, status')
    .eq('channel_id', channelId)
    .eq('status', 'active')
  if (error) throw new Error(error.message)

  const credentials: Record<string, string> = {}
  for (const row of data ?? []) {
    try {
      credentials[row.credential_type as string] = decryptSecret(row.encrypted_value as string)
    } catch (error) {
      // A credential encrypted with a different key must not silently disable the
      // channel: surface it so it can be re-entered.
      throw new CredentialConfigError(
        `Unable to decrypt credential "${row.credential_type}" for this channel. ` +
          `It was likely encrypted with a different ${CREDENTIAL_KEY_ENV}. ` +
          (error instanceof Error ? `(${error.message})` : '')
      )
    }
  }
  return credentials
}

/** Fails closed with a clear, non-secret-bearing error when a credential is absent. */
export function requireCredential(
  credentials: Record<string, string>,
  provider: string,
  credentialType: string
): string {
  const value = credentials[credentialType]
  if (!value) throw new CredentialMissingError(provider, credentialType)
  return value
}
