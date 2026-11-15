import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  createEmbeddedSignupOAuthState,
  ensureBusinessId,
  verifyEmbeddedSignupOAuthState,
} from '@/lib/channels/embedded-signup'
import { createFakeDb } from './support/fake-db'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const EXISTING_BUSINESS = 'bbbbbbbb-0000-4000-8000-000000000001'

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

  test('issues a signed state tied to the current organization and canonical Railway callback', () => {
    configureTestEnvironment()
    try {
      const result = createEmbeddedSignupOAuthState(ORG)
      expect(result.redirectUri).toBe(
        'https://kayan-ai.up.railway.app/api/whatsapp/embedded-signup-callback'
      )
      expect(verifyEmbeddedSignupOAuthState(result.state, ORG)).toEqual({
        redirectUri: result.redirectUri,
      })
    } finally {
      restoreTestEnvironment()
    }
  })

  test('rejects state issued for a different organization', () => {
    configureTestEnvironment()
    try {
      const result = createEmbeddedSignupOAuthState(ORG)
      expect(verifyEmbeddedSignupOAuthState(result.state, 'cccccccc-0000-4000-8000-000000000001')).toBeNull()
    } finally {
      restoreTestEnvironment()
    }
  })

  test('rejects a modified or expired state', () => {
    configureTestEnvironment()
    const realNow = Date.now
    try {
      const result = createEmbeddedSignupOAuthState(ORG)
      const [encoded, signature] = result.state.split('.')
      const replacement = signature.endsWith('a') ? 'b' : 'a'
      const tampered = encoded + '.' + signature.slice(0, -1) + replacement
      expect(verifyEmbeddedSignupOAuthState(tampered, ORG)).toBeNull()

      Date.now = () => realNow() + 31 * 60 * 1000
      expect(verifyEmbeddedSignupOAuthState(result.state, ORG)).toBeNull()
    } finally {
      Date.now = realNow
      restoreTestEnvironment()
    }
  })
})
