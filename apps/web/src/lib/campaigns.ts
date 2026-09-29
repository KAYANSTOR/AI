import type { SupabaseClient } from '@supabase/supabase-js'
import { getConsentStatus } from '@/lib/channels/consent'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { resolveSegmentContactIds, type SegmentCriteria } from '@/lib/segments'
import { recordMeterUsage } from '@/lib/billing/entitlements'

export async function materializeCampaignAudience(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    campaignId: string
    segmentId?: string | null
    criteria?: SegmentCriteria | null
  }
): Promise<number> {
  let contactIds: string[] = []

  if (input.segmentId) {
    const { data: segment } = await supabase
      .from('segments')
      .select('criteria')
      .eq('id', input.segmentId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()

    const criteria = (segment?.criteria ?? input.criteria ?? {}) as SegmentCriteria
    contactIds = await resolveSegmentContactIds(supabase, input.organizationId, criteria, 2000)
  } else if (input.criteria) {
    contactIds = await resolveSegmentContactIds(supabase, input.organizationId, input.criteria, 2000)
  }

  if (!contactIds.length) return 0

  const rows = contactIds.map((contactId) => ({
    organization_id: input.organizationId,
    campaign_id: input.campaignId,
    contact_id: contactId,
    status: 'pending',
  }))

  const { error } = await supabase.from('campaign_recipients').insert(rows)
  if (error && error.code !== '23505') throw error

  return contactIds.length
}

export async function processCampaignBatch(
  supabase: SupabaseClient,
  input: { organizationId: string; campaignId: string; limit?: number }
): Promise<{ queued: number; skipped: number; failed: number; completed: boolean }> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select(
      'id, organization_id, business_id, channel, status, template_body, rate_limit_per_minute, require_consent'
    )
    .eq('id', input.campaignId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) throw error
  if (!campaign || campaign.status !== 'running') {
    return { queued: 0, skipped: 0, failed: 0, completed: true }
  }

  const limit = Math.min(
    input.limit ?? campaign.rate_limit_per_minute ?? 30,
    Math.max(1, campaign.rate_limit_per_minute ?? 30)
  )

  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('id, contact_id')
    .eq('campaign_id', campaign.id)
    .eq('organization_id', input.organizationId)
    .eq('status', 'pending')
    .limit(limit)

  const { data: channel } = await supabase
    .from('channels')
    .select('id, business_id')
    .eq('organization_id', input.organizationId)
    .eq('channel_type', campaign.channel)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  let queued = 0
  let skipped = 0
  let failed = 0

  for (const row of recipients ?? []) {
    if (campaign.require_consent) {
      const consent = await getConsentStatus(supabase, row.contact_id, campaign.channel)
      if (consent === 'opted_out') {
        await supabase
          .from('campaign_recipients')
          .update({ status: 'skipped', skip_reason: 'opted_out' })
          .eq('id', row.id)
        skipped++
        continue
      }
    }

    if (!channel) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'failed', error: 'channel_unavailable' })
        .eq('id', row.id)
      failed++
      continue
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('phone')
      .eq('id', row.contact_id)
      .eq('organization_id', input.organizationId)
      .maybeSingle()

    const { data: identity } = await supabase
      .from('contact_identities')
      .select('external_user_id, external_phone')
      .eq('contact_id', row.contact_id)
      .eq('channel', campaign.channel)
      .limit(1)
      .maybeSingle()

    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''

    if (!recipient) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', skip_reason: 'missing_recipient' })
        .eq('id', row.id)
      skipped++
      continue
    }

    try {
      await enqueueOutbound({
        supabase,
        organizationId: input.organizationId,
        businessId: channel.business_id ?? campaign.business_id,
        channelId: channel.id,
        eventType: 'campaign.send',
        idempotencyKey: `campaign:${campaign.id}:${row.contact_id}`,
        recipient,
        payload: { body: campaign.template_body, campaign_id: campaign.id },
      })

      await supabase
        .from('campaign_recipients')
        .update({
          status: 'queued',
          recipient_address: recipient,
          queued_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'pending')

      queued++
      try {
        await recordMeterUsage(supabase, input.organizationId, 'campaign_sends', 1)
      } catch {
        // meter optional until migration applied
      }
    } catch (err) {
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 200) : 'enqueue_failed',
        })
        .eq('id', row.id)
      failed++
    }
  }

  const { count: remaining } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')

  const completed = (remaining ?? 0) === 0
  if (completed) {
    await supabase
      .from('campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('organization_id', input.organizationId)
      .eq('status', 'running')
  }

  return { queued, skipped, failed, completed }
}
