import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb, type FakeDb } from './support/fake-db'
import { normalizeE164, normalizePhone, resolveContactIdentity } from '@/lib/channels/contacts'

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002'

function setup(tables: FakeDb) {
  const fake = createFakeDb(tables)
  return { store: fake.store, db: fake.client as unknown as DbClient }
}

describe('phone normalisation', () => {
  test('normalizePhone keeps an explicit international prefix', () => {
    expect(normalizePhone('+966 50 000 0001')).toBe('+966500000001')
    expect(normalizePhone('00966500000001')).toBe('+966500000001')
  })

  test('normalizePhone never invents a country code', () => {
    expect(normalizePhone('(555) 000-0001')).toBe('5550000001')
  })

  test('normalizeE164 adds the plus that provider payloads omit', () => {
    expect(normalizeE164('966500000001')).toBe('+966500000001')
    expect(normalizeE164('+966500000001')).toBe('+966500000001')
    expect(normalizeE164('123')).toBe('123')
  })
})

describe('contact identity resolution', () => {
  test('an exact provider identity resolves to its existing contact', async () => {
    const { db } = setup({
      contact_identities: {
        rows: [
          {
            contact_id: 'contact-1',
            channel: 'whatsapp',
            external_user_id: 'wa-1',
            contacts: { id: 'contact-1', full_name: 'Noura', phone: '+966500000001', organization_id: ORG_A },
          },
        ],
      },
    })

    const result = await resolveContactIdentity(db, ORG_A, { channel: 'whatsapp', externalUserId: 'wa-1' })

    expect(result.contactId).toBe('contact-1')
    expect(result.isNew).toBe(false)
    expect(result.fullName).toBe('Noura')
  })

  test('an identity owned by another organization is never reused', async () => {
    const { store, db } = setup({
      contacts: { rows: [] },
      contact_identities: {
        rows: [
          {
            contact_id: 'contact-a',
            channel: 'instagram',
            external_user_id: 'ig-shared',
            contacts: { id: 'contact-a', full_name: 'Org A customer', phone: null, organization_id: ORG_A },
          },
        ],
      },
    })

    const result = await resolveContactIdentity(db, ORG_B, { channel: 'instagram', externalUserId: 'ig-shared' })

    expect(result.contactId).not.toBe('contact-a')
    expect(result.isNew).toBe(true)
    expect(result.organizationId).toBe(ORG_B)
    expect(store.contacts.rows?.[0]?.organization_id).toBe(ORG_B)
  })

  test('an exact phone match inside the tenant reuses the contact and adds the identity', async () => {
    const { store, db } = setup({
      contacts: { rows: [{ id: 'contact-1', organization_id: ORG_A, phone: '+966500000001', full_name: 'Noura' }] },
      contact_identities: { rows: [] },
    })

    const result = await resolveContactIdentity(db, ORG_A, {
      channel: 'sms',
      externalUserId: '+966500000001',
      phone: '00966500000001',
    })

    expect(result.contactId).toBe('contact-1')
    expect(store.contacts.rows?.length).toBe(1)
    expect(store.contact_identities.rows?.[0]?.external_user_id).toBe('+966500000001')
  })

  test('a same phone in another organization does not match', async () => {
    const { db } = setup({
      contacts: { rows: [{ id: 'contact-a', organization_id: ORG_A, phone: '+966500000001', full_name: 'A' }] },
      contact_identities: { rows: [] },
    })

    const result = await resolveContactIdentity(db, ORG_B, { channel: 'sms', phone: '+966500000001' })

    expect(result.contactId).not.toBe('contact-a')
    expect(result.isNew).toBe(true)
  })

  test('a new customer is created with an identity row', async () => {
    const { store, db } = setup({ contacts: { rows: [] }, contact_identities: { rows: [] } })

    const result = await resolveContactIdentity(db, ORG_A, {
      channel: 'whatsapp',
      externalUserId: 'wa-new',
      phone: '+966500000002',
      displayName: 'Faisal',
    })

    expect(result.isNew).toBe(true)
    expect(store.contacts.rows?.[0]?.full_name).toBe('Faisal')
    expect(store.contact_identities.rows?.[0]?.channel).toBe('whatsapp')
  })

  test('a similar name alone never merges two customers', async () => {
    const { store, db } = setup({
      contacts: { rows: [{ id: 'contact-1', organization_id: ORG_A, phone: '+966500000001', full_name: 'محمد علي' }] },
      contact_identities: { rows: [] },
    })

    const result = await resolveContactIdentity(db, ORG_A, {
      channel: 'instagram',
      externalUserId: 'ig-different-person',
      displayName: 'محمد على',
    })

    expect(result.contactId).not.toBe('contact-1')
    expect(store.contacts.rows?.length).toBe(2)
  })
})
