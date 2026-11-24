import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  fingerprintSecret,
  isSecretRef,
  listUserSecrets,
  newSecretRef,
  resolveUserSecret,
  revokeUserSecret,
  saveUserSecret,
  withUserSecret,
} from '@/lib/vault/service'
import { decryptSecret } from '@/lib/credentials/service'
import { createFakeDb } from './support/fake-db'

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')

const OWNER = {
  organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
  userId: 'ffffffff-0000-4000-8000-000000000001',
}

function setup() {
  return createFakeDb({ user_secret_vault: { rows: [] } })
}

describe('fill-only secret vault', () => {
  test('stores an encrypted value and returns metadata without the plaintext', async () => {
    const fake = setup()
    const secret = await saveUserSecret(fake.client as unknown as DbClient, OWNER, {
      label: 'مفتاح بوابة الدفع',
      kind: 'api_key',
      value: 'sk_live_super_secret',
    })

    expect(isSecretRef(secret.secret_ref)).toBe(true)
    expect(secret).not.toHaveProperty('value')
    expect(secret).not.toHaveProperty('ciphertext')
    expect(JSON.stringify(secret)).not.toContain('sk_live_super_secret')

    const stored = String(fake.store.user_secret_vault.rows?.[0]?.ciphertext ?? '')
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain('sk_live_super_secret')
    expect(decryptSecret(stored)).toBe('sk_live_super_secret')
  })

  test('listing returns metadata only and never ciphertext', async () => {
    const fake = setup()
    const db = fake.client as unknown as DbClient
    await saveUserSecret(db, OWNER, { label: 'رمز', kind: 'token', value: 'token-value' })
    const list = await listUserSecrets(db, OWNER)

    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('ciphertext')
    expect(JSON.stringify(list)).not.toContain('token-value')
    expect(list[0].fingerprint).toBe(fingerprintSecret('token-value'))
  })

  test('the broker resolves the value only inside a server callback', async () => {
    const fake = setup()
    const db = fake.client as unknown as DbClient
    const secret = await saveUserSecret(db, OWNER, { label: 'مفتاح', value: 'abc123' })

    const resolved = await resolveUserSecret(db, OWNER, secret.secret_ref)
    expect(resolved?.value).toBe('abc123')

    const output = await withUserSecret(db, OWNER, secret.secret_ref, async (value) => {
      // Never return the value; return a derived, non-secret result.
      return { used: value.length }
    })
    expect(output).toEqual({ used: 6 })
    expect(fake.store.user_secret_vault.rows?.[0]?.last_used_at).toBeTruthy()
  })

  test('another owner cannot resolve the reference (owner-scoped lookup)', async () => {
    const fake = setup()
    const db = fake.client as unknown as DbClient
    const secret = await saveUserSecret(db, OWNER, { label: 'مفتاح', value: 'abc123' })

    const other = { organizationId: OWNER.organizationId, userId: 'eeeeeeee-0000-4000-8000-000000000009' }
    expect(await resolveUserSecret(db, other, secret.secret_ref)).toBeNull()
  })

  test('revoking stops future use but keeps the audit row', async () => {
    const fake = setup()
    const db = fake.client as unknown as DbClient
    const secret = await saveUserSecret(db, OWNER, { label: 'مفتاح', value: 'abc123' })

    expect(await revokeUserSecret(db, OWNER, secret.secret_ref)).toBe(true)
    expect(await resolveUserSecret(db, OWNER, secret.secret_ref)).toBeNull()
    expect(fake.store.user_secret_vault.rows).toHaveLength(1)
    expect(fake.store.user_secret_vault.rows?.[0]?.status).toBe('revoked')
  })

  test('rejects empty values, long values and unknown references', async () => {
    const fake = setup()
    const db = fake.client as unknown as DbClient
    await expect(saveUserSecret(db, OWNER, { label: 'x', value: '   ' })).rejects.toThrow('invalid_secret_value')
    await expect(saveUserSecret(db, OWNER, { label: 'x', value: 'a'.repeat(5000) })).rejects.toThrow('secret_too_long')
    expect(await resolveUserSecret(db, OWNER, 'not-a-ref')).toBeNull()
    expect(await revokeUserSecret(db, OWNER, 'sec_bad')).toBe(false)
  })

  test('secret references are random and URL-safe', () => {
    const refs = new Set(Array.from({ length: 50 }, () => newSecretRef()))
    expect(refs.size).toBe(50)
    for (const ref of refs) expect(isSecretRef(ref)).toBe(true)
  })
})
