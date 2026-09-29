'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowTrigger } from '@/lib/workflows/triggers'

export type InboxResult = { ok: boolean; error?: string; message?: string }

async function loadConversation(ctx: AuthorizedContext, conversationId: string) {
  const { data, error } = await ctx.supabase
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
  const { data } = await ctx.supabase
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
    const { error } = await ctx.supabase
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
    if (error) return { ok: false, error: supabaseActionError(error) }

    if (memberId) {
      await createNotification(ctx.supabase, {
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
      await dispatchWorkflowTrigger(ctx.supabase, {
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

    const { data: member, error: memberError } = await ctx.supabase
      .from('organization_members')
      .select('id, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('id', memberId)
      .maybeSingle()

    if (memberError) return { ok: false, error: supabaseActionError(memberError) }
    if (!member || member.is_active === false) {
      return { ok: false, error: 'العضو غير موجود أو غير نشط.' }
    }

    const { error } = await ctx.supabase
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

    if (error) return { ok: false, error: supabaseActionError(error) }

    await createNotification(ctx.supabase, {
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

    const { error } = await ctx.supabase
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
    if (error) return { ok: false, error: supabaseActionError(error) }

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
    const { error } = await ctx.supabase
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
    if (error) return { ok: false, error: supabaseActionError(error) }

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
    const { error } = await ctx.supabase
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
    if (error) return { ok: false, error: supabaseActionError(error) }

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

    const { error } = await ctx.supabase.from('conversation_notes').insert({
      organization_id: ctx.organizationId,
      conversation_id: conversation.id,
      author_id: memberId,
      body: note,
    })
    if (error) return { ok: false, error: supabaseActionError(error) }

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
    const { error: msgError } = await ctx.supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('organization_id', ctx.organizationId)
      .eq('direction', 'inbound')
      .eq('is_read', false)

    if (msgError) return { ok: false, error: supabaseActionError(msgError) }

    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث حالة القراءة.') }
  }
}
