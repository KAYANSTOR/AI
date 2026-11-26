import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { DbClient } from '@/lib/db/client'
import { assertCampaignBusiness } from '@/lib/campaigns/access'
import { processCampaignBatch } from '@/lib/campaigns'
import { createFakeDb } from './support/fake-db'

const org = 'org-a'
const campaign = 'campaign-a'
const source = (path: string) => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
function fixture(orgSector = 'clinic', profileSector = 'clinic') {
  return createFakeDb({
    organizations: { rows: [{ id: org, business_type: orgSector }] },
    business_profiles: { rows: [{ organization_id: org, business_type_id: profileSector }] },
    campaigns: { rows: [{ id: campaign, organization_id: org, status: 'paused' }] },
  })
}
describe('campaign safety boundaries', () => {
  test('commercial sector works; either personal sector record blocks', async () => {
    await assertCampaignBusiness(fixture().client as unknown as DbClient, org)
    for (const [a, b] of [['personal_assistant', 'clinic'], ['clinic', 'personal_assistant']]) {
      let denied = false
      try { await assertCampaignBusiness(fixture(a, b).client as unknown as DbClient, org) } catch { denied = true }
      expect(denied).toBe(true)
    }
  })
  test('missing workspace profile fails closed', async () => {
    let denied = false
    try { await assertCampaignBusiness(fixture().client as unknown as DbClient, 'other') } catch { denied = true }
    expect(denied).toBe(true)
  })
  test('a paused campaign does not report completion', async () => {
    const { client, store } = fixture()
    const result = await processCampaignBatch(client as unknown as DbClient, { organizationId: org, campaignId: campaign })
    expect(result.completed).toBe(false)
    expect(store.campaigns.rows?.[0].status).toBe('paused')
  })
  test('scheduled activation validates audience and plan before transition', () => {
    const code = source('lib/campaigns.ts').split('export async function activateScheduledCampaign')[1].split('export async function processCampaignBatch')[0]
    expect(code.indexOf('await materializeCampaignAudience')).toBeGreaterThan(-1)
    expect(code.indexOf('await assertWithinLimit')).toBeLessThan(code.indexOf(".update({ status: 'running'"))
    expect(code).toContain(".eq('status', 'scheduled').eq('scheduled_at', campaign.scheduled_at)")
    expect(source('app/api/cron/campaigns/route.ts')).toContain('await activateScheduledCampaign(')
  })
  test('read failure cannot be interpreted as completed', () => {
    const code = source('lib/campaigns.ts')
    expect(code).toContain('if (recipientsError) throw recipientsError')
    expect(code).toContain("if (remainingError || remaining === null) throw new Error('campaign_remaining_unavailable')")
    expect(code).toContain("if (completionError) throw completionError")
  })
  test('pause remains available and stops scheduled activation', () => {
    const code = source('app/dashboard/campaigns/actions.ts').split('export async function pauseCampaignAction')[1]
    expect(code).toContain('await requireAdminCapability(null)')
    expect(code).not.toContain('assertCampaignBusiness')
    expect(code).toContain(".in('status', ['running', 'scheduled'])")
    expect(code).toContain('if (!paused)')
  })
})
