import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  createEmbeddedSignupOAuthState,
  debugMetaAccessToken,
  debugCustomerAccessToken,
  ensureBusinessId,
  hasMetaWabaAccess,
  verifyEmbeddedSignupOAuthState,
} from '@/lib/channels/embedded-signup'
import { createFakeDb } from './support/fake-db'
import { META_LINK_NOTICES } from '@/lib/channels/meta-connection'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const EXISTING_BUSINESS = 'bbbbbbbb-0000-4000-8000-000000000001'

describe('Meta token authorization', () => {
  test('rejects missing messaging permissions and expired tokens and scopes the WhatsApp grant', async () => {
    const previousAppId = process.env.NEXT_PUBLIC_META_APP_ID
    const previousSecret = process.env.META_APP_SECRET
    const appId = '10000000'
    process.env.NEXT_PUBLIC_META_APP_ID = appId
    process.env.META_APP_SECRET = 'synthetic-app-secret'
    const accepted = { app_id: appId, is_valid: true, expires_at: 0 }
    const originalFetch = globalThis.fetch
    const responses = [
      Response.json({ data: { ...accepted, scopes: ['pages_show_list'] } }),
      Response.json({ data: { ...accepted, expires_at: 1 } }),
      Response.json({ data: {
        ...accepted,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['10000001'] }],
      } }),
    ]
    globalThis.fetch = (async () => {
      const response = responses.shift()
      if (!response) throw new Error('Unexpected call to Meta')
      return response
    }) as typeof fetch
    const token = Buffer.from('synthetic-token')
    try {
      await expect(debugMetaAccessToken(token, ['pages_messaging'])).rejects.toThrow(META_LINK_NOTICES.meta_permission)
      await expect(debugMetaAccessToken(token, ['pages_messaging'])).rejects.toThrow(META_LINK_NOTICES.meta_expired)
      const grant = await debugCustomerAccessToken(token)
      expect(hasMetaWabaAccess(grant, '10000001')).toBe(true)
      expect(hasMetaWabaAccess(grant, '10000002')).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
      token.fill(0)
      if (previousAppId === undefined) delete process.env.NEXT_PUBLIC_META_APP_ID
      else process.env.NEXT_PUBLIC_META_APP_ID = previousAppId
      if (previousSecret === undefined) delete process.env.META_APP_SECRET
      else process.env.META_APP_SECRET = previousSecret
    }
  })
})

describe('WhatsApp Embedded Signup business binding', () => {
  test('reuses the organization business already linked to its profile', async () => {
    const fake = createFakeDb({
      business_profiles: {
        rows: [{ organization_id: ORG, business_id: EXISTING_BUSINESS, business_type_id: 'sales', timezone: 'Asia/Aden' }],
      },
      businesses: {
        rows: [{ id: EXISTING_BUSINESS, organization_id: ORG, name: 'Kayan', slug: 'kayan' }],
      },
    })

    const businessId = await ensureBusinessId(fake.client as unknown as DbClient, ORG, null, 'Kayan')

    expect(businessId).toBe(EXISTING_BUSINESS)
    expect(fake.store.businesses.rows).toHaveLength(1)
  })

  test('creates and links a business using the canonical organizations.name field', async () => {
    const fake = createFakeDb({
      business_profiles: {
        rows: [{ organization_id: ORG, business_id: null, business_type_id: 'sales', timezone: 'Asia/Aden' }],
      },
      businesses: { rows: [] },
      organizations: { rows: [{ id: ORG, name: 'Kayan Software' }] },
    })

    const businessId = await ensureBusinessId(fake.client as unknown as DbClient, ORG, null)

    expect(fake.store.businesses.rows).toHaveLength(1)
    expect(fake.store.businesses.rows?.[0]?.id).toBe(businessId)
    expect(fake.store.businesses.rows?.[0]?.name).toBe('Kayan Software')
    expect(fake.store.businesses.rows?.[0]?.business_type_id).toBe('sales')
    expect(fake.store.business_profiles.rows?.[0]?.business_id).toBe(businessId)
  })

  test('prefers the trusted organization name supplied by the authenticated organization context', async () => {
    const fake = createFakeDb({
      business_profiles: {
        rows: [{ organization_id: ORG, business_id: null, business_type_id: 'sales', timezone: 'Asia/Aden' }],
      },
      businesses: { rows: [] },
      organizations: { rows: [{ id: ORG, name: 'Database Name' }] },
    })

    const businessId = await ensureBusinessId(fake.client as unknown as DbClient, ORG, null, 'Authenticated Org Name')

    expect(fake.store.businesses.rows?.[0]?.name).toBe('Authenticated Org Name')
    expect(fake.store.business_profiles.rows?.[0]?.business_id).toBe(businessId)
  })

  test('fails clearly rather than inventing a business name when organization data is missing', async () => {
    const fake = createFakeDb({
      business_profiles: {
        rows: [{ organization_id: ORG, business_id: null, business_type_id: 'sales', timezone: 'Asia/Aden' }],
      },
      businesses: { rows: [] },
      organizations: { rows: [{ id: ORG, name: '   ' }] },
    })

    await expect(ensureBusinessId(fake.client as unknown as DbClient, ORG, null)).rejects.toThrow(
      'اسم المؤسسة غير متوفر لإنشاء سجل النشاط.'
    )
    expect(fake.store.businesses.rows).toHaveLength(0)
  })
})


describe('WhatsApp Embedded Signup OAuth callback state', () => {
  const previousAuthSecret = process.env.AUTH_SECRET
  const previousRailwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

  function configureTestEnvironment() {
    process.env.AUTH_SECRET = 'unit-test-oauth-state-secret-with-enough-entropy'
    process.env.RAILWAY_PUBLIC_DOMAIN = 'kayan-ai.up.railway.app'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  }

  function restoreTestEnvironment() {
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousAuthSecret
    if (previousRailwayDomain === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN
    else process.env.RAILWAY_PUBLIC_DOMAIN = previousRailwayDomain
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }

  function createNonceStore() {
    const hashes = new Set<string>()
    return {
      persist: async (_organizationId: string, hash: string) => { hashes.add(hash) },
      consume: async (_organizationId: string, hash: string) => {
        if (!hashes.has(hash)) return false
        hashes.delete(hash)
        return true
      },
    }
  }

  test('issues a signed state tied to the canonical callback and consumes it once', async () => {
    configureTestEnvironment()
    const nonces = createNonceStore()
    try {
      const result = await createEmbeddedSignupOAuthState(ORG, nonces.persist)
      expect(result.redirectUri).toBe('https://kayan-ai.up.railway.app/api/whatsapp/embedded-signup-callback')
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume)).toEqual({
        redirectUri: result.redirectUri,
      })
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume)).toBeNull()
    } finally { restoreTestEnvironment() }
  })

  test('rejects state issued for another organization without consuming the original state', async () => {
    configureTestEnvironment()
    const nonces = createNonceStore()
    try {
      const result = await createEmbeddedSignupOAuthState(ORG, nonces.persist)
      expect(await verifyEmbeddedSignupOAuthState(
        result.state,
        'cccccccc-0000-4000-8000-000000000001',
        nonces.consume
      )).toBeNull()
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume)).not.toBeNull()
    } finally { restoreTestEnvironment() }
  })

  test('binds a social authorization to its organization, purpose and selected page', async () => {
    configureTestEnvironment()
    const nonces = createNonceStore()
    const social = { channel: 'messenger', pageId: '10000001' } as const
    try {
      const result = await createEmbeddedSignupOAuthState(ORG, nonces.persist, social)
      expect(new URL(result.redirectUri).pathname).toBe('/api/meta/connect/callback')
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume)).toBeNull()
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume, 'instagram')).toBeNull()
      expect(await verifyEmbeddedSignupOAuthState(
        result.state, 'cccccccc-0000-4000-8000-000000000001', nonces.consume, 'messenger',
      )).toBeNull()
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume, 'messenger')).toEqual({
        redirectUri: result.redirectUri, social,
      })
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume, 'messenger')).toBeNull()
    } finally { restoreTestEnvironment() }
  })

  test('rejects a modified or expired state before nonce consumption', async () => {
    configureTestEnvironment()
    const nonces = createNonceStore()
    const realNow = Date.now
    try {
      const result = await createEmbeddedSignupOAuthState(ORG, nonces.persist)
      const [encoded, signature] = result.state.split('.')
      const changed = signature.startsWith('A') ? 'B' : 'A'
      const tampered = encoded + '.' + changed + signature.slice(1)
      expect(await verifyEmbeddedSignupOAuthState(tampered, ORG, nonces.consume)).toBeNull()

      Date.now = () => realNow() + 31 * 60 * 1000
      expect(await verifyEmbeddedSignupOAuthState(result.state, ORG, nonces.consume)).toBeNull()
    } finally {
      Date.now = realNow
      restoreTestEnvironment()
    }
  })
})
