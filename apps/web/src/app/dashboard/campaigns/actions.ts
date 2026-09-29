'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { materializeCampaignAudience } from '@/lib/campaigns'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'

export type CampaignResult = { ok: true; campaignId?: string } | { ok: false; error: string }

export async function createCampaignAction(input: {
  name: string
  channel?: string
  templateBody: string
  segmentId?: string | null
  scheduledAt?: string | null
  rateLimitPerMinute?: number
}): Promise<CampaignResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const name = input.name.trim()
    const body = input.templateBody.trim()
    if (!name) return { ok: false, error: 'الاسم مطلوب.' }
    if (!body) return { ok: false, error: 'نص الرسالة مطلوب.' }

    const { data, error } = await ctx.supabase
      .from('campaigns')
      .insert({
        organization_id: ctx.organizationId,
        business_id: ctx.businessId,
        name,
        channel: input.channel || 'whatsapp',
        template_body: body,
        segment_id: input.segmentId || null,
        scheduled_at: input.scheduledAt || null,
        rate_limit_per_minute: Math.max(1, Math.min(120, input.rateLimitPerMinute ?? 30)),
        status: input.scheduledAt ? 'scheduled' : 'draft',
        require_consent: true,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'campaign.created', 'campaign', data.id)
    revalidatePath('/dashboard/campaigns')
    return { ok: true, campaignId: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إنشاء الحملة.') }
  }
}

export async function startCampaignAction(campaignId: string): Promise<CampaignResult> {
  try {
    const ctx = await requireAdminCapability(null)

    const { data: campaign, error: readError } = await ctx.supabase
      .from('campaigns')
      .select('id, status, segment_id')
      .eq('id', campaignId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: supabaseActionError(readError) }
    if (!campaign) return { ok: false, error: 'الحملة غير موجودة.' }
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      return { ok: false, error: 'لا يمكن بدء الحملة من حالتها الحالية.' }
    }

    const audienceSize = await materializeCampaignAudience(ctx.supabase, {
      organizationId: ctx.organizationId,
      campaignId,
      segmentId: campaign.segment_id,
    })

    try {
      await assertWithinLimit(
        ctx.supabase,
        ctx.organizationId,
        'campaign_sends',
        Math.max(1, audienceSize)
      )
    } catch (err) {
      if (err instanceof EntitlementExceededError) {
        return {
          ok: false,
          error: `تجاوزت حد إرسال الحملات (${err.used}/${err.limit}). رقِّ الباقة أو قلّل الجمهور.`,
        }
      }
      throw err
    }

    const { error } = await ctx.supabase
      .from('campaigns')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'campaign.started', 'campaign', campaignId, { audienceSize })
    revalidatePath('/dashboard/campaigns')
    return { ok: true, campaignId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر بدء الحملة.') }
  }
}

export async function pauseCampaignAction(campaignId: string): Promise<CampaignResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const { error } = await ctx.supabase
      .from('campaigns')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'running')

    if (error) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'campaign.paused', 'campaign', campaignId)
    revalidatePath('/dashboard/campaigns')
    return { ok: true, campaignId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إيقاف الحملة.') }
  }
}
