import type { DbClient } from '@/lib/db/client'
import { getConsentStatus, isMarketingConsentGranted } from '@/lib/channels/consent'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { resolveSegmentContactIds, type SegmentCriteria } from '@/lib/segments'
import { assertCampaignBusiness } from '@/lib/campaigns/access'
import { assertWithinLimit, recordMeterUsage } from '@/lib/billing/entitlements'
import { renderCampaignTemplate } from '@/lib/campaigns/template'

export async function materializeCampaignAudience(
  db: DbClient,
  input: {
    organizationId: string
    campaignId: string
    segmentId?: string | null
    criteria?: SegmentCriteria | null
  }
): Promise<number> {
  let contactIds: string[] = []

  if (input.segmentId) {
    const { data: segment, error } = await db
      .from('segments')
      .select('criteria, is_active')
      .eq('id', input.segmentId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()

    if (error) throw error
    if (!segment || segment.is_active === false) {
      throw new Error('campaign_segment_not_found_or_inactive')
    }

    const criteria = (segment.criteria ?? input.criteria ?? {}) as SegmentCriteria
    contactIds = await resolveSegmentContactIds(db, input.organizationId, criteria, 2000)
  } else if (input.criteria) {
    contactIds = await resolveSegmentContactIds(db, input.organizationId, input.criteria, 2000)
  }

  if (!contactIds.length) return 0

  const rows = contactIds.map((contactId) => ({
    organization_id: input.organizationId,
    campaign_id: input.campaignId,
    contact_id: contactId,
    status: 'pending',
  }))

  const { error } = await db.from('campaign_recipients').upsert(rows, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
  if (error) throw error

  return contactIds.length
}

/** Scheduled activation must prepare the audience and validate the current plan
 * before claiming the transition. A failed preparation leaves the schedule intact.
 */
export async function activateScheduledCampaign(
  db: DbClient,
  input: { organizationId: string; campaignId: string; now: string }
): Promise<boolean> {
  await assertCampaignBusiness(db, input.organizationId)
  const { data: campaign, error } = await db.from('campaigns')
    .select('id, segment_id, audience_criteria, scheduled_at')
    .eq('id', input.campaignId).eq('organization_id', input.organizationId)
    .eq('status', 'scheduled').lte('scheduled_at', input.now).maybeSingle()
  if (error) throw error
  if (!campaign) return false
  const audienceSize = await materializeCampaignAudience(db, {
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    segmentId: campaign.segment_id,
    criteria: campaign.audience_criteria as SegmentCriteria | null,
  })
  if (!audienceSize) throw new Error('campaign_empty_audience')
  const { count, error: countError } = await db.from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organizationId).eq('campaign_id', input.campaignId).eq('status', 'pending')
  if (countError || count === null || count === 0) throw new Error('campaign_audience_unavailable')
  await assertWithinLimit(db, input.organizationId, 'campaign_sends', count)
  const { data: claimed, error: claimError } = await db.from('campaigns')
    .update({ status: 'running', started_at: input.now, updated_at: input.now })
    .eq('organization_id', input.organizationId).eq('id', input.campaignId)
    .eq('status', 'scheduled').eq('scheduled_at', campaign.scheduled_at).select('id').maybeSingle()
  if (claimError) throw claimError
  return Boolean(claimed)
}

export async function processCampaignBatch(
  db: DbClient,
  input: { organizationId: string; campaignId: string; limit?: number }
): Promise<{ queued: number; skipped: number; failed: number; completed: boolean }> {
  await assertCampaignBusiness(db, input.organizationId)
  const { data: campaign, error } = await db
    .from('campaigns')
    .select(
      'id, organization_id, business_id, channel, status, template_body, rate_limit_per_minute, require_consent'
    )
    .eq('id', input.campaignId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) throw error
  if (!campaign || campaign.status !== 'running') {
    return { queued: 0, skipped: 0, failed: 0, completed: false }
  }

  const limit = Math.min(
    input.limit ?? campaign.rate_limit_per_minute ?? 30,
    Math.max(1, campaign.rate_limit_per_minute ?? 30)
  )

  const { data: recipients, error: recipientsError } = await db
    .from('campaign_recipients')
    .select('id, contact_id')
    .eq('campaign_id', campaign.id)
    .eq('organization_id', input.organizationId)
    .eq('status', 'pending')
    .order('id').limit(limit)
  if (recipientsError) throw recipientsError

  const { data: channel, error: channelError } = await db
    .from('channels')
    .select('id, business_id')
    .eq('organization_id', input.organizationId)
    .eq('channel_type', campaign.channel)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (channelError) throw channelError

  let queued = 0
  let skipped = 0
  let failed = 0

  for (const row of recipients ?? []) {
    // Verify ownership before consulting consent or resolving a recipient identity.
    const { data: contact, error: contactError } = await db
      .from('contacts').select('phone, full_name')
      .eq('id', row.contact_id).eq('organization_id', input.organizationId).maybeSingle()
    if (contactError) throw contactError
    if (!contact) {
      const { error: skipError } = await db.from('campaign_recipients')
        .update({ status: 'skipped', skip_reason: 'contact_not_in_workspace' })
        .eq('id', row.id).eq('organization_id', input.organizationId).eq('status', 'pending')
      if (skipError) throw skipError
      skipped++
      continue
    }
    if (campaign.require_consent) {
      const consent = await getConsentStatus(db, row.contact_id, campaign.channel, 'marketing')
      if (!isMarketingConsentGranted(consent)) {
        await db
          .from('campaign_recipients')
          .update({
            status: 'skipped',
            skip_reason: consent === 'opted_out' ? 'opted_out' : 'marketing_consent_required',
          })
          .eq('id', row.id)
          .eq('organization_id', input.organizationId)
        skipped++
        continue
      }
    }

    if (!channel) {
      await db
        .from('campaign_recipients')
        .update({ status: 'failed', error: 'channel_unavailable' })
        .eq('id', row.id)
        .eq('organization_id', input.organizationId)
      failed++
      continue
    }

    const { data: identity, error: identityError } = await db
      .from('contact_identities')
      .select('external_user_id, external_phone')
      .eq('contact_id', row.contact_id)
      .eq('channel', campaign.channel)
      .limit(1)
      .maybeSingle()

    if (identityError) throw identityError

    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''

    if (!recipient) {
      await db
        .from('campaign_recipients')
        .update({ status: 'skipped', skip_reason: 'missing_recipient' })
        .eq('id', row.id)
        .eq('organization_id', input.organizationId)
      skipped++
      continue
    }

    try {
      await enqueueOutbound({
        db,
        organizationId: input.organizationId,
        businessId: channel.business_id ?? campaign.business_id,
        channelId: channel.id,
        eventType: 'campaign.send',
        idempotencyKey: `campaign:${campaign.id}:${row.contact_id}`,
        recipient,
        payload: {
          body: renderCampaignTemplate(campaign.template_body, contact?.full_name as string | null),
          campaign_id: campaign.id,
          // Campaigns are business-initiated and therefore template-bound after 24h.
          initiated_by: 'business',
          template_variables: [String(contact?.full_name ?? 'عميلنا العزيز')],
        },
      })

      await db
        .from('campaign_recipients')
        .update({
          status: 'queued',
          recipient_address: recipient,
          queued_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'pending')
        .eq('organization_id', input.organizationId)

      queued++
      try {
        await recordMeterUsage(db, input.organizationId, 'campaign_sends', 1)
      } catch {
        // meter optional until migration applied
      }
    } catch (err) {
      await db
        .from('campaign_recipients')
        .update({
          status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 200) : 'enqueue_failed',
        })
        .eq('id', row.id)
        .eq('organization_id', input.organizationId)
      failed++
    }
  }

  const { count: remaining, error: remainingError } = await db
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('organization_id', input.organizationId)
    .eq('status', 'pending')

  if (remainingError || remaining === null) throw new Error('campaign_remaining_unavailable')
  let completed = remaining === 0
  if (completed) {
    const { data: changed, error: completionError } = await db
      .from('campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('organization_id', input.organizationId)
      .eq('status', 'running').select('id').maybeSingle()
    if (completionError) throw completionError
    completed = Boolean(changed)
  }

  return { queued, skipped, failed, completed }
}
