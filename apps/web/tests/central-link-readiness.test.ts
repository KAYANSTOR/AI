import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { getCentralLinkConfig } from '@/lib/central-bot/config'
import { readCentralLinkStatus, unlinkCentralBot } from '@/lib/central-bot/link-status'
import { createFakeDb } from './support/fake-db'

const owner = { organizationId: 'org-a', userId: 'user-a' }
const credentials = { KAYAN_CENTRAL_WA_PHONE_NUMBER_ID: '123', KAYAN_CENTRAL_WA_ACCESS_TOKEN: 'test-token', KAYAN_CENTRAL_WA_DISPLAY_NUMBER: '+1 202 555 0100' }
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', ...credentials }
const unconfiguredEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
const asDb = (client: unknown) => client as DbClient

describe('central bot local link readiness', () => {
  test('requires all credentials and a valid display number', () => {
    expect(getCentralLinkConfig(env)?.displayNumber).toBe('12025550100')
    for (const key of Object.keys(credentials)) expect(getCentralLinkConfig({ ...env, [key]: '' })).toBeNull()
    for (const value of ['0', '0123456789', '1234567', '1234567890123456']) expect(getCentralLinkConfig({ ...env, KAYAN_CENTRAL_WA_DISPLAY_NUMBER: value })).toBeNull()
  })
  test('missing credentials never report configured even for a linked account', async () => {
    const { client } = createFakeDb({ personal_assistant_links: { rows: [{ org_id: owner.organizationId, user_id: owner.userId, whatsapp_phone: '+12025550101', verified_at: '2026-01-01', kill_switch_active: true }] } })
    const status = await readCentralLinkStatus(asDb(client), owner, unconfiguredEnv)
    expect(status.configured).toBe(false)
    expect(status.linked).toBe(true)
    expect(status.killSwitchActive).toBe(true)
    expect(status.phoneMasked).toBe('+1202•••101')
  })
  test('reads only the requesting owner and distinguishes absent link from configuration', async () => {
    const { client } = createFakeDb({ personal_assistant_links: { rows: [{ org_id: 'org-b', user_id: owner.userId, whatsapp_phone: '+12025550101', verified_at: '2026-01-01' }, { org_id: owner.organizationId, user_id: 'user-b', whatsapp_phone: '+12025550102', verified_at: '2026-01-01' }] } })
    expect(await readCentralLinkStatus(asDb(client), owner, env)).toEqual({ configured: true, linked: false, phoneMasked: null, killSwitchActive: false })
  })
  test('unlink clears pending token and binding only for the owner, preserves kill switch and is idempotent', async () => {
    const row = { org_id: owner.organizationId, user_id: owner.userId, whatsapp_phone: '+12025550101', verified_at: '2026-01-01', verification_token: 'code', token_expires_at: '2026-01-02', kill_switch_active: true }
    const { client, store } = createFakeDb({ personal_assistant_links: { rows: [row, { ...row, org_id: 'org-b' }, { ...row, user_id: 'user-b' }] } })
    await unlinkCentralBot(asDb(client), owner)
    await unlinkCentralBot(asDb(client), owner)
    expect(store.personal_assistant_links.rows?.[0]).toMatchObject({ whatsapp_phone: null, verified_at: null, verification_token: null, token_expires_at: null, kill_switch_active: true })
    expect(store.personal_assistant_links.rows?.[1]).toHaveProperty('verification_token', 'code')
    expect(store.personal_assistant_links.rows?.[2]).toHaveProperty('verification_token', 'code')
  })
  test('database errors are not converted to unlinked or successful disconnect', async () => {
    const failure = { data: null, error: { message: 'database unavailable' } }
    const query = { select: () => query, update: () => query, eq: () => query, maybeSingle: async () => failure, then: (resolve: (value: typeof failure) => unknown) => Promise.resolve(failure).then(resolve) }
    const db = asDb({ from: () => query })
    await expect(readCentralLinkStatus(db, owner, env)).rejects.toThrow('link_status_failed')
    await expect(unlinkCentralBot(db, owner)).rejects.toThrow('link_disconnect_failed')
  })
})
