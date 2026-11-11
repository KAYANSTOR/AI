import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { ensureBusinessId } from '@/lib/channels/embedded-signup'
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
