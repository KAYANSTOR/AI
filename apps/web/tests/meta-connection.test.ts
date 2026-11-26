import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { CHANNEL_SPECS } from '@/lib/channels/management'
import { canManageMetaChannels, isMetaChannel, metaLinkStatusFromGraph, selectMetaPage } from '@/lib/channels/meta-connection'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { canRegisterWhatsAppCloudApiNumber, publicMetaConnectionMode, resolveWhatsAppConnectionMode, whatsAppConnectionModeLabel } from '@/lib/channels/whatsapp-connection-mode'
import { createFakeDb } from './support/fake-db'

describe('unified Meta channel setup', () => {
  const page = {
    id: '10000001',
    access_token: 'synthetic-page-token',
    tasks: ['MESSAGING'],
    instagram_business_account: { id: '20000001' },
  }

  test('lists each Meta channel once under its shared setup path', () => {
    expect(CHANNEL_SPECS.filter((spec) => isMetaChannel(spec.type)).map((spec) => spec.type))
      .toEqual(['whatsapp', 'instagram', 'messenger'])
  })

  test('binds Instagram to its professional account and Messenger to its Page', () => {
    expect(selectMetaPage([page], 'instagram', null)?.assetId).toBe('20000001')
    expect(selectMetaPage([page], 'messenger', null)?.assetId).toBe('10000001')
    expect(selectMetaPage([page], 'messenger', '10000002')).toBeNull()
  })

  test('displays the verified coexistence mode and preserves the separate QR adapter', () => {
    const mode = resolveWhatsAppConnectionMode({
      isOnBizApp: true, platformType: 'CLOUD_API', sessionMarkedCoexistence: true,
    })
    expect(publicMetaConnectionMode(mode)).toBe('coexistence')
    expect(whatsAppConnectionModeLabel(mode)).toBe('التعايش مع تطبيق واتساب للأعمال')
    expect(canRegisterWhatsAppCloudApiNumber(mode)).toBe(false)
    expect(publicMetaConnectionMode('cloud_api')).toBe('cloud_only')
    expect(publicMetaConnectionMode('qr_unofficial')).toBeNull()
    expect(canRegisterWhatsAppCloudApiNumber('qr_unofficial')).toBe(false)
  })

  test('requires an explicit selection when more than one eligible page is granted', () => {
    const otherPage = { ...page, id: '10000002' }
    expect(selectMetaPage([page, otherPage], 'messenger', null)).toBeNull()
    expect(selectMetaPage([page, otherPage], 'messenger', otherPage.id)?.assetId).toBe(otherPage.id)
  })

  test('rejects unauthorized organization roles and pages without messaging rights', () => {
    expect(canManageMetaChannels('owner')).toBe(true)
    expect(canManageMetaChannels('admin')).toBe(true)
    for (const role of ['member', 'agent', 'viewer', null]) {
      expect(canManageMetaChannels(role)).toBe(false)
    }
    expect(selectMetaPage([{ ...page, tasks: ['ANALYZE'] }], 'messenger', null)).toBeNull()
    expect(metaLinkStatusFromGraph(200, 400)).toBe('meta_permission')
    expect(metaLinkStatusFromGraph(190, 400)).toBe('meta_expired')
  })

  test('an organization cannot resolve another organization’s Meta binding', async () => {
    const fake = createFakeDb({
      channels: { rows: [{
        id: 'synthetic-channel',
        organization_id: 'synthetic-org-a',
        business_id: 'synthetic-business-a',
        channel_type: 'messenger',
        provider_account_id: page.id,
        is_active: true,
        verification_status: 'verified',
      }] },
    })
    const db = fake.client as unknown as DbClient
    const binding = { channelType: 'messenger', providerAccountId: page.id }
    expect(await resolveChannelExact(db, { ...binding, organizationId: 'synthetic-org-b' })).toBeNull()
    expect((await resolveChannelExact(db, { ...binding, organizationId: 'synthetic-org-a' }))?.id)
      .toBe('synthetic-channel')
  })
})
