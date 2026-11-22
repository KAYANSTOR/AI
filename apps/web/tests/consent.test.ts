import { describe, expect, test } from 'bun:test'
import { getConsentStatus, isMarketingConsentGranted } from '@/lib/channels/consent'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb } from './support/fake-db'

describe('marketing consent gate', () => {
  test('only an explicit opted-in status grants marketing permission', () => {
    expect(isMarketingConsentGranted('opted_in')).toBe(true)
    expect(isMarketingConsentGranted('opted_out')).toBe(false)
    expect(isMarketingConsentGranted('unknown')).toBe(false)
    expect(isMarketingConsentGranted(null)).toBe(false)
  })

  test('reads the latest consent for the requested purpose and channel', async () => {
    const fake = createFakeDb({
      consents: {
        rows: [
          {
            contact_id: 'contact-1',
            channel: 'whatsapp',
            purpose: 'marketing',
            status: 'opted_out',
            captured_at: '2026-01-01T00:00:00.000Z',
          },
          {
            contact_id: 'contact-1',
            channel: 'whatsapp',
            purpose: 'marketing',
            status: 'opted_in',
            captured_at: '2026-02-01T00:00:00.000Z',
          },
          {
            contact_id: 'contact-1',
            channel: 'whatsapp',
            purpose: 'transactional',
            status: 'opted_out',
            captured_at: '2026-03-01T00:00:00.000Z',
          },
        ],
      },
    })

    const status = await getConsentStatus(
      fake.client as unknown as DbClient,
      'contact-1',
      'whatsapp',
      'marketing'
    )

    expect(status).toBe('opted_in')
  })

  test('returns null when no consent exists for the requested purpose', async () => {
    const fake = createFakeDb({ consents: { rows: [] } })
    const status = await getConsentStatus(
      fake.client as unknown as DbClient,
      'contact-1',
      'whatsapp',
      'marketing'
    )
    expect(status).toBeNull()
  })
})
