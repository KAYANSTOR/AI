import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'
import {
  CredentialConfigError,
  CredentialMissingError,
  credentialsStorageConfigured,
  decryptSecret,
  encryptSecret,
  loadChannelCredentials,
  redactSecret,
  requireCredential,
  saveChannelCredential,
  secretEquals,
} from '@/lib/credentials/service'
import { resolveChannelProviderCredentials } from '@/lib/credentials/resolve'

// 32 bytes of key material; a test fixture, never a real production key.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64')
const SECRET = 'EAAG-super-secret-token-value'

const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY
const originalPlatform = process.env.PLATFORM_PROVIDER_CREDENTIALS

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY
  delete process.env.PLATFORM_PROVIDER_CREDENTIALS
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY
  else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey
  if (originalPlatform === undefined) delete process.env.PLATFORM_PROVIDER_CREDENTIALS
  else process.env.PLATFORM_PROVIDER_CREDENTIALS = originalPlatform
})

describe('credential encryption', () => {
  test('round-trips a value', () => {
    expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET)
  })

  test('ciphertext never contains the plaintext', () => {
    const payload = encryptSecret(SECRET)
    expect(payload).not.toContain(SECRET)
    expect(payload).not.toContain('super-secret')
  })

  test('the same value encrypts differently every time (random IV)', () => {
    const first = encryptSecret(SECRET)
    const second = encryptSecret(SECRET)
    expect(first).not.toBe(second)
    expect(decryptSecret(first)).toBe(SECRET)
    expect(decryptSecret(second)).toBe(SECRET)
  })

  test('a different key cannot decrypt, and does not return garbage', () => {
    const payload = encryptSecret(SECRET)
    process.env.CREDENTIAL_ENCRYPTION_KEY = OTHER_KEY
    expect(() => decryptSecret(payload)).toThrow()
  })

  test('a tampered ciphertext is rejected by the authentication tag', () => {
    const payload = encryptSecret(SECRET)
    const parts = payload.split(':')
    const tampered = Buffer.from(parts[4], 'base64')
    tampered[0] = tampered[0] ^ 0xff
    parts[4] = tampered.toString('base64')
    expect(() => decryptSecret(parts.join(':'))).toThrow()
  })

  test('a malformed payload is rejected', () => {
    expect(() => decryptSecret('not-a-real-payload')).toThrow(CredentialConfigError)
  })
})

describe('missing or invalid configuration fails closed', () => {
  test('no key at all is a clear configuration error, not a plaintext fallback', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY
    expect(credentialsStorageConfigured()).toBe(false)
    expect(() => encryptSecret(SECRET)).toThrow(CredentialConfigError)
  })

  test('a key of the wrong length is rejected', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64')
    expect(credentialsStorageConfigured()).toBe(false)
    expect(() => encryptSecret(SECRET)).toThrow(CredentialConfigError)
  })

  test('a 64-character hex key is accepted', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('hex')
    expect(credentialsStorageConfigured()).toBe(true)
    expect(decryptSecret(encryptSecret('hello'))).toBe('hello')
  })
})

describe('redaction', () => {
  test('never reveals more than the last four characters', () => {
    const redacted = redactSecret(SECRET)
    expect(redacted).toBe('••••alue')
    expect(redacted).not.toContain('EAAG')
  })

  test('an absent value renders as a placeholder', () => {
    expect(redactSecret(null)).toBe('—')
    expect(redactSecret(undefined)).toBe('—')
    expect(redactSecret('')).toBe('—')
  })

  test('secret comparison is exact', () => {
    expect(secretEquals('abc', 'abc')).toBe(true)
    expect(secretEquals('abc', 'abd')).toBe(false)
    expect(secretEquals('abc', 'abcd')).toBe(false)
  })
})

describe('per-channel storage', () => {
  function channelTables() {
    return {
      provider_credentials: {
        unique: [['channel_id', 'provider', 'credential_type']],
        rows: [],
      },
    }
  }

  test('saving encrypts at rest: the row never holds the plaintext', async () => {
    const fake = createFakeSupabase(channelTables())
    const supabase = fake.client as unknown as SupabaseClient

    await saveChannelCredential(supabase, {
      organizationId: 'org-1',
      channelId: 'chan-1',
      provider: 'meta',
      credentialType: 'access_token',
      value: SECRET,
    })

    const stored = String(fake.db.provider_credentials.rows?.[0]?.encrypted_value ?? '')
    expect(stored).not.toContain(SECRET)
    expect(stored.startsWith('v1:')).toBe(true)
  })

  test('loading returns decrypted values for active credentials', async () => {
    const fake = createFakeSupabase(channelTables())
    const supabase = fake.client as unknown as SupabaseClient
    await saveChannelCredential(supabase, {
      organizationId: 'org-1',
      channelId: 'chan-1',
      provider: 'twilio',
      credentialType: 'auth_token',
      value: SECRET,
    })

    const credentials = await loadChannelCredentials(supabase, 'chan-1')
    expect(credentials.auth_token).toBe(SECRET)
  })

  test('a credential encrypted with another key surfaces a configuration error', async () => {
    const payload = encryptSecret(SECRET)
    const fake = createFakeSupabase({
      provider_credentials: {
        rows: [
          {
            channel_id: 'chan-1',
            provider: 'meta',
            credential_type: 'access_token',
            encrypted_value: payload,
            status: 'active',
          },
        ],
      },
    })
    const supabase = fake.client as unknown as SupabaseClient
    process.env.CREDENTIAL_ENCRYPTION_KEY = OTHER_KEY

    expect(loadChannelCredentials(supabase, 'chan-1')).rejects.toThrow(CredentialConfigError)
  })
})

describe('resolution policy', () => {
  test('an unconfigured channel yields no credentials rather than a shared global token', async () => {
    const fake = createFakeSupabase({ provider_credentials: { rows: [] } })
    const supabase = fake.client as unknown as SupabaseClient

    const credentials = await resolveChannelProviderCredentials(supabase, {
      channelId: 'chan-1',
      channelType: 'whatsapp',
    })

    expect(credentials.access_token).toBeUndefined()
    expect(credentials.__provider).toBe('meta')
  })

  test('requireCredential fails closed with a message that carries no secret', () => {
    try {
      requireCredential({}, 'meta', 'access_token')
      throw new Error('expected a failure')
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialMissingError)
      expect((error as Error).message).toContain('meta')
      expect((error as Error).message).not.toContain(SECRET)
    }
  })

  test('channel credentials win over the operator fallback', async () => {
    process.env.PLATFORM_PROVIDER_CREDENTIALS = 'true'
    process.env.WHATSAPP_ACCESS_TOKEN = 'platform-token'
    const fake = createFakeSupabase({
      provider_credentials: {
        rows: [
          {
            channel_id: 'chan-1',
            provider: 'meta',
            credential_type: 'access_token',
            encrypted_value: encryptSecret('tenant-token'),
            status: 'active',
          },
        ],
      },
    })
    const supabase = fake.client as unknown as SupabaseClient

    const credentials = await resolveChannelProviderCredentials(supabase, {
      channelId: 'chan-1',
      channelType: 'whatsapp',
    })

    expect(credentials.access_token).toBe('tenant-token')
    delete process.env.WHATSAPP_ACCESS_TOKEN
  })
})
