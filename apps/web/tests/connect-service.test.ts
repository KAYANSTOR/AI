import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveWhatsAppBinding } from '@/lib/channels/connect-service'
import { encryptSecret } from '@/lib/credentials/service'
import { createFakeSupabase } from './support/fake-supabase'

const TEST_KEY = Buffer.alloc(32, 7).toString('base64')
const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY
const originalPlatformCredentials = process.env.PLATFORM_PROVIDER_CREDENTIALS

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY
  delete process.env.PLATFORM_PROVIDER_CREDENTIALS
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY
  else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey
  if (originalPlatformCredentials === undefined) delete process.env.PLATFORM_PROVIDER_CREDENTIALS
  else process.env.PLATFORM_PROVIDER_CREDENTIALS = originalPlatformCredentials
})

describe('WhatsApp number binding', () => {
  test('does not reuse a stored provider id when the submitted number differs', async () => {
    const fake = createFakeSupabase({
      provider_credentials: {
        rows: [
          {
            channel_id: 'channel-1',
            provider: 'meta',
            credential_type: 'phone_number_id',
            encrypted_value: encryptSecret('provider-number-1'),
            status: 'active',
          },
        ],
      },
    })

    const result = await resolveWhatsAppBinding({
      supabase: fake.client as unknown as SupabaseClient,
      channel: {
        id: 'channel-1',
        provider_account_id: 'existing-provider-id',
        external_identifier: '+12025550100',
        verification_status: 'verified',
        is_active: true,
      },
      number: '+12025550199',
    })

    expect(result.status).toBe('pending')
    expect(result.reason).toBe('no_credentials')
    expect(result.phoneNumberId).toBeNull()
  })

  test('reuses an existing provider id only when the exact number matches', async () => {
    const fake = createFakeSupabase({})

    const result = await resolveWhatsAppBinding({
      supabase: fake.client as unknown as SupabaseClient,
      channel: {
        id: 'channel-1',
        provider_account_id: 'existing-provider-id',
        external_identifier: '+1 (202) 555-0100',
        verification_status: 'verified',
        is_active: true,
      },
      number: '0012025550100',
    })

    expect(result.status).toBe('verified')
    expect(result.reason).toBe('already_bound')
    expect(result.phoneNumberId).toBe('existing-provider-id')
  })

  test('does not reuse a provider id from a matching but unverified binding', async () => {
    const fake = createFakeSupabase({})

    const result = await resolveWhatsAppBinding({
      supabase: fake.client as unknown as SupabaseClient,
      channel: {
        id: 'channel-1',
        provider_account_id: 'existing-provider-id',
        external_identifier: '+12025550100',
        verification_status: 'pending',
        is_active: true,
      },
      number: '+12025550100',
    })

    expect(result.status).toBe('pending')
    expect(result.reason).toBe('no_credentials')
    expect(result.phoneNumberId).toBeNull()
  })
})