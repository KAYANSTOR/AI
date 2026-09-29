'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { getConsentStatus } from '@/lib/channels/consent'

export type ScheduleResult = { ok: true; outboxId?: string } | { ok: false; error: string }

export async function scheduleOutboundMessageAction(input: {
  conversationId: string
  body: string
  scheduledAt: string
}): Promise<ScheduleResult> {
  try {
    const ctx = await requireCapability('inbox')
    if (ctx.role === 'read_only') return { ok: false, error: 'صلاحية القراءة فقط.' }

    const body = input.body.trim()
    if (!body) return { ok: false, error: 'نص الرسالة مطلوب.' }

    const when = new Date(input.scheduledAt)
    if (Number.isNaN(when.getTime())) return { ok: false, error: 'وقت غير صالح.' }
    if (when.getTime() < Date.now() - 60_000) {
      return { ok: false, error: 'يجب أن يكون الوقت في المستقبل.' }
    }

    const { data: conversation, error: readError } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id, channel_id, status, business_id')
      .eq('id', input.conversationId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: supabaseActionError(readError) }
    if (!conversation) return { ok: false, error: 'المحادثة غير موجودة.' }
    if (conversation.status === 'closed') return { ok: false, error: 'المحادثة مغلقة.' }
    if (!conversation.channel_id) return { ok: false, error: 'لا توجد قناة مرتبطة.' }

    const { data: channel } = await ctx.supabase
      .from('channels')
      .select('id, channel_type, business_id, is_active')
      .eq('id', conversation.channel_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (!channel?.is_active) return { ok: false, error: 'القناة غير نشطة.' }

    const consent = await getConsentStatus(
      ctx.supabase,
      conversation.contact_id,
      channel.channel_type
    )
    if (consent === 'opted_out') return { ok: false, error: 'العميل ألغى الاشتراك.' }

    const { data: contact } = await ctx.supabase
      .from('contacts')
      .select('phone')
      .eq('id', conversation.contact_id)
      .maybeSingle()

    const { data: identity } = await ctx.supabase
      .from('contact_identities')
      .select('external_user_id, external_phone')
      .eq('contact_id', conversation.contact_id)
      .eq('channel', channel.channel_type)
      .limit(1)
      .maybeSingle()

    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''
    if (!recipient) return { ok: false, error: 'لا يوجد عنوان إرسال للعميل.' }

    const outboxId = await enqueueOutbound({
      supabase: ctx.supabase,
      organizationId: ctx.organizationId,
      businessId: channel.business_id ?? conversation.business_id,
      channelId: channel.id,
      eventType: 'staff.scheduled_message',
      idempotencyKey: `sched:${input.conversationId}:${when.toISOString()}:${body.slice(0, 40)}`,
      recipient,
      payload: {
        body,
        conversation_id: input.conversationId,
        contact_id: conversation.contact_id,
      },
      scheduledAt: when,
    })

    await audit(ctx, 'conversation.message_scheduled', 'conversation', input.conversationId, {
      scheduledAt: when.toISOString(),
      outboxId,
    })

    revalidatePath(`/dashboard/conversations/${input.conversationId}`)
    return { ok: true, outboxId: outboxId || undefined }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر جدولة الرسالة.') }
  }
}
