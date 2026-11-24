'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowTrigger } from '@/lib/workflows/triggers'
import { getConsentStatus } from '@/lib/channels/consent'
import { normalizeChannelNumber } from '@/lib/channels/management'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { deliverOutbound, deliverWhatsAppTemplate, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { loadConversationMessages, THREAD_MESSAGE_COLUMNS, toThreadMessage, type ThreadMessage, type ThreadPage } from '@/lib/inbox/messages'
import { drainOutbox } from '@/lib/channels/outbox-drain'
import { createAdminClient } from '@/lib/db/admin'

export type InboxResult = { ok: boolean; error?: string; message?: string }
export type StaffReplyResult = InboxResult & { delivery?: 'sent' | 'queued' | 'blocked'; confirmed?: ThreadMessage | null }

async function loadConversation(ctx: AuthorizedContext, conversationId: string) {
  const { data, error } = await ctx.db
    .from('conversations')
    .select('id, organization_id, contact_id, channel_id, status, ai_enabled, state, human_assignee_id')
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('لم يتم العثور على المحادثة.')
  return data
}

async function currentMemberId(ctx: AuthorizedContext): Promise<string | null> {
  const { data } = await ctx.db
    .from('organization_members')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  return data?.id ?? null
}

export async function takeOverAction(conversationId: string, reason?: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: 'المحادثة مغلقة ولا يمكن استلامها.' }
    }

    const memberId = await currentMemberId(ctx)
    const { error } = await ctx.db
      .from('conversations')
      .update({
        status: 'handed_off',
        ai_enabled: false,
        state: 'human_handoff',
        ai_paused_at: new Date().toISOString(),
        handoff_reason: reason?.trim() ? reason.trim().slice(0, 500) : 'staff_takeover',
        human_assignee_id: memberId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }

    if (memberId) {
      await createNotification(ctx.db, {
        organizationId: ctx.organizationId,
        memberId,
        entityType: 'conversation',
        entityId: conversationId,
        notificationType: 'handoff',
        title: 'تم استلام المحادثة',
        body: 'أصبحت مسؤولاً عن هذه المحادثة بعد تسليم من الوكيل.',
        idempotencyKey: `handoff:${conversationId}:${memberId}`,
      })
    }

    try {
      await dispatchWorkflowTrigger(ctx.db, {
        organizationId: ctx.organizationId,
        triggerType: 'conversation.handoff',
        payload: {
          conversationId,
          contactId: conversation.contact_id,
          memberId,
          reason: reason ?? 'staff_takeover',
        },
        idempotencyPrefix: `conv-handoff:${conversationId}`,
      })
    } catch {
      // non-blocking
    }

    await audit(ctx, 'conversation.takeover', 'conversation', conversationId, {
      assigned: Boolean(memberId),
    })
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تم استلام المحادثة. الوكيل متوقف حتى يُستأنف.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر استلام المحادثة.') }
  }
}

export async function assignConversationAction(
  conversationId: string,
  memberId: string
): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (ctx.role === 'read_only') {
    return { ok: false, error: 'صلاحية القراءة فقط لا تسمح بالتعيين.' }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: 'لا يمكن تعيين محادثة مغلقة.' }
    }

    const { data: member, error: memberError } = await ctx.db
      .from('organization_members')
      .select('id, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('id', memberId)
      .maybeSingle()

    if (memberError) return { ok: false, error: dbActionError(memberError) }
    if (!member || member.is_active === false) {
      return { ok: false, error: 'العضو غير موجود أو غير نشط.' }
    }

    const { error } = await ctx.db
      .from('conversations')
      .update({
        human_assignee_id: memberId,
        status: conversation.status === 'active' ? 'handed_off' : conversation.status,
        ai_enabled: false,
        state: 'human_handoff',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: dbActionError(error) }

    await createNotification(ctx.db, {
      organizationId: ctx.organizationId,
      memberId,
      entityType: 'conversation',
      entityId: conversationId,
      notificationType: 'assignment',
      title: 'تعيين محادثة',
      body: 'تم تعيين محادثة جديدة إليك.',
      idempotencyKey: `assign:${conversationId}:${memberId}`,
    })

    await audit(ctx, 'conversation.assigned', 'conversation', conversationId, { memberId })
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تم تعيين المحادثة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر التعيين.') }
  }
}

export async function resumeAiAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: 'المحادثة مغلقة.' }
    }

    const { error } = await ctx.db
      .from('conversations')
      .update({
        status: 'active',
        ai_enabled: true,
        state: 'waiting_customer',
        ai_paused_at: null,
        handoff_reason: null,
        human_assignee_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }

    await audit(ctx, 'conversation.ai_resumed', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تمت إعادة تفعيل الوكيل على المحادثة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر استئناف الوكيل.') }
  }
}

export async function closeConversationAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    await loadConversation(ctx, conversationId)
    const { error } = await ctx.db
      .from('conversations')
      .update({
        status: 'closed',
        ai_enabled: false,
        state: 'closed',
        sla_state: 'resolved',
        resolved_at: new Date().toISOString(),
        human_assignee_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }

    await audit(ctx, 'conversation.closed', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تم إغلاق المحادثة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إغلاق المحادثة.') }
  }
}

export async function reopenConversationAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    await loadConversation(ctx, conversationId)
    const { error } = await ctx.db
      .from('conversations')
      .update({
        status: 'handed_off',
        ai_enabled: false,
        state: 'human_handoff',
        resolved_at: null,
        sla_state: 'normal',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }

    await audit(ctx, 'conversation.reopened', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تمت إعادة فتح المحادثة والوكيل ما زال متوقفاً.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّرت إعادة الفتح.') }
  }
}

export async function addNoteAction(conversationId: string, body: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const note = body.trim()
  if (!note) return { ok: false, error: 'الملاحظة فارغة.' }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    const memberId = await currentMemberId(ctx)
    if (!memberId) return { ok: false, error: 'تعذّر تحديد عضو الفريق الحالي.' }

    const { error } = await ctx.db.from('conversation_notes').insert({
      organization_id: ctx.organizationId,
      conversation_id: conversation.id,
      author_id: memberId,
      body: note,
    })
    if (error) return { ok: false, error: dbActionError(error) }

    await audit(ctx, 'conversation.note_added', 'conversation', conversationId)
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تمت إضافة الملاحظة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إضافة الملاحظة.') }
  }
}

export async function markAsReadAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'Unauthorized') }
  }

  try {
    const { error: msgError } = await ctx.db
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .eq('direction', 'inbound')
      .eq('is_read', false)

    if (msgError) return { ok: false, error: dbActionError(msgError) }

    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث حالة القراءة.') }
  }
}

/** Staff reply on the conversation channel (WhatsApp/SMS/etc). */
export async function sendHumanReplyAction(
  conversationId: string,
  body: string
): Promise<StaffReplyResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (ctx.role === 'read_only') {
    return { ok: false, error: 'صلاحية القراءة فقط لا تسمح بالإرسال.' }
  }

  const text = body.trim()
  if (!text) return { ok: false, error: 'نص الرسالة فارغ.' }
  if (text.length > 4000) return { ok: false, error: 'الرسالة طويلة جداً.' }

  try {
    const { data: conversation, error: readError } = await ctx.db
      .from('conversations')
      .select('id, contact_id, channel_id, status, business_id, ai_enabled')
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: dbActionError(readError) }
    if (!conversation) return { ok: false, error: 'المحادثة غير موجودة.' }
    if (conversation.status === 'closed') {
      return { ok: false, error: 'المحادثة مغلقة. أعد فتحها قبل الإرسال.' }
    }
    if (!conversation.channel_id) return { ok: false, error: 'لا توجد قناة مرتبطة بالمحادثة.' }

    const { data: channel } = await ctx.db
      .from('channels')
      .select(
        'id, organization_id, business_id, channel_type, provider_account_id, external_identifier, is_active'
      )
      .eq('id', conversation.channel_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (!channel?.is_active) return { ok: false, error: 'القناة غير نشطة.' }

    const { data: contact } = await ctx.db
      .from('contacts')
      .select('phone')
      .eq('id', conversation.contact_id)
      .maybeSingle()

    const { data: identity } = await ctx.db
      .from('contact_identities')
      .select('external_user_id, external_phone')
      .eq('contact_id', conversation.contact_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const recipient = (
      identity?.external_phone ||
      identity?.external_user_id ||
      contact?.phone ||
      ''
    ).trim()
    if (!recipient) return { ok: false, error: 'لا يوجد رقم أو معرّف للإرسال لهذا العميل.' }

    const consent = await getConsentStatus(ctx.db, conversation.contact_id, channel.channel_type)
    if (consent === 'opted_out') return { ok: false, error: 'العميل ألغى الاشتراك ولا يمكن مراسلته.' }

    if (conversation.ai_enabled) {
      await ctx.db
        .from('conversations')
        .update({
          ai_enabled: false,
          status: conversation.status === 'active' ? 'handed_off' : conversation.status,
          state: 'human_handoff',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('organization_id', ctx.organizationId)
    }

    const idempotencyKey = `staff-reply:${conversationId}:${Date.now()}:${text.slice(0, 24)}`
    const delivery = await deliverOutbound(ctx.db, {
      channel: {
        id: channel.id,
        organizationId: channel.organization_id,
        businessId: channel.business_id,
        channelType: channel.channel_type,
        providerAccountId: channel.provider_account_id,
        externalIdentifier: channel.external_identifier,
      },
      recipient,
      body: text,
      idempotencyKey,
      conversationId,
      queueOnFailure: true,
      senderType: 'human_dashboard',
    })

    let finalDelivery: 'sent' | 'queued' | 'blocked' = delivery
    let confirmedKey: string | null = null
    if (delivery === 'sent') {
      await recordDeliveredOutboundMessage(ctx.db, {
        organizationId: ctx.organizationId,
        conversationId,
        body: text,
        idempotencyKey,
        senderType: 'human_dashboard',
      })
      confirmedKey = idempotencyKey
    } else if (delivery === 'queued') {
      // Manual dashboard replies must not wait for the cron: drain this one intent now.
      // The authenticated client only has SELECT on outbox_events, so the scoped
      // drain runs with the service role, filtered to this org + idempotency key.
      try {
        const drained = await drainOutbox(createAdminClient(), {
          limit: 1,
          only: { organizationId: ctx.organizationId, idempotencyKey },
        })
        if (drained.sentEventIds[0]) {
          finalDelivery = 'sent'
          confirmedKey = 'outbox:' + drained.sentEventIds[0]
        }
      } catch (drainError) {
        console.error('Immediate outbox drain failed; the scheduled drain will retry', {
          conversationId,
          reason: drainError instanceof Error ? drainError.message.slice(0, 200) : 'unknown',
        })
      }
    }

    let confirmed: ThreadMessage | null = null
    if (confirmedKey) {
      const { data: row } = await ctx.db
        .from('messages')
        .select(THREAD_MESSAGE_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .eq('conversation_id', conversationId)
        .eq('external_message_id', confirmedKey)
        .maybeSingle()
      confirmed = row ? toThreadMessage(row as Record<string, unknown>) : null
    }

    await ctx.db
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    await audit(ctx, 'conversation.staff_reply', 'conversation', conversationId, {
      delivery: finalDelivery,
      length: text.length,
    })

    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    if (finalDelivery === 'blocked') {
      return { ok: false, error: 'تعذّر تسليم الرسالة عبر القناة. تحقق من اتصال القناة.', delivery: finalDelivery, confirmed: null }
    }
    return { ok: true, delivery: finalDelivery, confirmed }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إرسال الرد.') }
  }
}


export type StartWhatsAppConversationInput = {
  phone: string
  displayName?: string
  templateName: string
  languageCode: string
  bodyParameters?: string[]
  consentConfirmed: boolean
}

export type StartWhatsAppConversationResult = InboxResult & { conversationId?: string }

/**
 * Creates a manual WhatsApp conversation by first sending an approved template.
 * A business-initiated conversation cannot begin with free-form text. The recipient
 * must have opted in; the operator confirms that consent before this action proceeds.
 */
export async function startWhatsAppConversationAction(
  input: StartWhatsAppConversationInput
): Promise<StartWhatsAppConversationResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (ctx.role === 'read_only') {
    return { ok: false, error: 'صلاحية القراءة فقط لا تسمح ببدء محادثة.' }
  }
  if (!input || input.consentConfirmed !== true) {
    return { ok: false, error: 'أكد موافقة المستلم على تلقي الرسائل قبل المتابعة.' }
  }

  const phone = normalizeChannelNumber(String(input.phone ?? ''))
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { ok: false, error: 'أدخل رقم واتساب صحيحاً مع مفتاح الدولة، مثل +967777123456.' }
  }

  const recipient = phone.replace(/\D/g, '')
  const displayName = String(input.displayName ?? '').trim().slice(0, 120)
  const templateName = String(input.templateName ?? '').trim()
  const languageCode = String(input.languageCode ?? '').trim()
  const bodyParameters = Array.isArray(input.bodyParameters)
    ? input.bodyParameters.map((value) => String(value).trim())
    : []

  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) {
    return { ok: false, error: 'اسم القالب غير صحيح. استخدم الاسم المعتمد كما يظهر في Meta.' }
  }
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)) {
    return { ok: false, error: 'رمز لغة القالب غير صحيح، مثال en_US أو ar.' }
  }
  if (bodyParameters.length > 10 || bodyParameters.some((value) => !value || value.length > 1024)) {
    return { ok: false, error: 'تحقق من متغيرات القالب: لا تترك قيمة فارغة، والحد الأقصى 10 قيم.' }
  }

  let conversationId: string | undefined
  try {
    const { data: channel, error: channelError } = await ctx.db
      .from('channels')
      .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier, is_active, verification_status')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', 'whatsapp')
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (channelError) return { ok: false, error: dbActionError(channelError) }
    if (!channel) {
      return { ok: false, error: 'لا توجد قناة WhatsApp متصلة وجاهزة. افتح صفحة القنوات وأكمل الربط أولاً.' }
    }
    if (!channel.provider_account_id) {
      return { ok: false, error: 'القناة ظاهرة كمتصلة لكن معرّف رقم Meta غير محفوظ. أعد فحص ربط القناة.' }
    }

    const contact = await resolveContactIdentity(ctx.db, ctx.organizationId, {
      channel: 'whatsapp',
      externalUserId: recipient,
      phone,
      displayName: displayName || null,
    })
    const currentConsent = await getConsentStatus(ctx.db, contact.contactId, 'whatsapp')
    if (currentConsent === 'opted_out') {
      return { ok: false, error: 'هذا الرقم أوقف استقبال رسائل النشاط التجاري سابقاً، لذلك لن نرسل إليه.' }
    }

    const providerResult = await deliverWhatsAppTemplate(ctx.db, {
      channel: {
        id: channel.id,
        organizationId: channel.organization_id,
        businessId: channel.business_id,
        channelType: 'whatsapp',
        providerAccountId: channel.provider_account_id,
        externalIdentifier: channel.external_identifier,
      },
      recipient,
      template: { name: templateName, languageCode, bodyParameters },
    })

    const consent = await getConsentStatus(ctx.db, contact.contactId, 'whatsapp')
    if (consent !== 'opted_in') {
      const { error: consentError } = await ctx.db.from('consents').insert({
        organization_id: ctx.organizationId,
        contact_id: contact.contactId,
        channel: 'whatsapp',
        purpose: 'marketing',
        status: 'opted_in',
        source: 'dashboard_manual_outbound',
        captured_at: new Date().toISOString(),
      })
      if (consentError) throw new Error(consentError.message)
    }

    conversationId = await ensureOpenConversation(ctx.db, {
      organizationId: ctx.organizationId,
      businessId: channel.business_id,
      contactId: contact.contactId,
      channelId: channel.id,
    })

    const idempotencyKey = 'manual-template:' + (providerResult.messageId || randomUUID())
    await recordDeliveredOutboundMessage(ctx.db, {
      organizationId: ctx.organizationId,
      conversationId,
      body: 'قالب WhatsApp: ' + templateName,
      idempotencyKey,
      externalMessageId: providerResult.messageId,
    })

    await audit(ctx, 'conversation.manual_template_sent', 'conversation', conversationId, {
      channel_type: 'whatsapp',
      template_name: templateName,
      language_code: languageCode,
      recipient_suffix: recipient.slice(-4),
      consent_confirmed: true,
      provider_message_id_received: Boolean(providerResult.messageId),
    })

    revalidatePath('/dashboard/conversations')
    revalidatePath('/dashboard/conversations/' + conversationId)

    return {
      ok: true,
      conversationId,
      message: 'قبلت Meta طلب إرسال القالب، وحُفظت المحادثة في صندوق الوارد.',
    }
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'تعذّر بدء المحادثة. تحقق من القالب وبيانات قناة Meta ثم حاول مجدداً.'),
      conversationId,
    }
  }
}

/** "Load older" for the conversation thread (keyset pagination, newest first). */
export async function loadOlderMessagesAction(
  conversationId: string,
  cursor: string
): Promise<{ ok: true; page: ThreadPage } | { ok: false; error: string }> {
  try {
    const ctx = await requireCapability('inbox')
    await loadConversation(ctx, conversationId)
    const page = await loadConversationMessages(ctx.db, { organizationId: ctx.organizationId, conversationId, cursor })
    return { ok: true, page }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحميل الرسائل الأقدم.') }
  }
}
