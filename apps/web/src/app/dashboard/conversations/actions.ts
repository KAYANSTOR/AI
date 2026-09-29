'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type InboxResult = { ok: boolean; error?: string; message?: string }

/** Every action targets one conversation inside the caller's own organization. */
async function loadConversation(ctx: AuthorizedContext, conversationId: string) {
  const { data, error } = await ctx.supabase
    .from('conversations')
    .select('id, organization_id, contact_id, channel_id, status, ai_enabled, state')
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('┘┘à ┘è╪ز┘à ╪د┘╪╣╪س┘ê╪▒ ╪╣┘┘ë ╪د┘┘à╪ص╪د╪»╪س╪ر.')
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

/**
 * Human takeover.
 *
 * The conversation is not replaced and not duplicated: it moves to `handed_off` with
 * `ai_enabled=false`, so the runtime stops generating replies while the customer keeps
 * writing into the same thread. The open-conversation invariant already treats any
 * non-closed status as open, which is exactly what keeps the handoff durable.
 */
export async function takeOverAction(conversationId: string, reason?: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪║┘è╪▒ ┘à╪╡╪▒╪ص.') }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: '╪د┘┘à╪ص╪د╪»╪س╪ر ┘à╪║┘┘é╪ر╪î ╪ث╪╣╪» ┘╪ز╪ص┘ç╪د ┘é╪ذ┘ ╪د┘╪د╪│╪ز┘╪د┘à.' }
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

    await audit(ctx, 'conversation.takeover', 'conversation', conversationId, { assigned: Boolean(memberId) })
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: '╪ز┘à ╪د╪│╪ز┘╪د┘à ╪د┘┘à╪ص╪د╪»╪س╪ر. ╪د┘┘ê┘â┘è┘ ┘à╪ز┘ê┘é┘ ┘ê┘┘ ┘è╪▒╪» ╪ص╪ز┘ë ╪ز╪│╪ز╪ث┘┘┘ç.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪ز╪╣╪░┘ّ╪▒ ╪د╪│╪ز┘╪د┘à ╪د┘┘à╪ص╪د╪»╪س╪ر. ╪ص╪د┘ê┘ ┘à╪▒╪ر ╪ث╪«╪▒┘ë.') }
  }
}

/**
 * Resuming the AI is an explicit staff decision, never an automatic side effect of an
 * inbound message.
 */
export async function resumeAiAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪║┘è╪▒ ┘à╪╡╪▒╪ص.') }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: '╪د┘┘à╪ص╪د╪»╪س╪ر ┘à╪║┘┘é╪ر.' }
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
    return { ok: true, message: '╪ز┘à╪ز ╪ح╪╣╪د╪»╪ر ╪د┘┘ê┘â┘è┘ ╪ح┘┘ë ╪د┘┘à╪ص╪د╪»╪س╪ر.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪ز╪╣╪░┘ّ╪▒ ╪د╪│╪ز╪خ┘╪د┘ ╪د┘┘ê┘â┘è┘. ╪ص╪د┘ê┘ ┘à╪▒╪ر ╪ث╪«╪▒┘ë.') }
  }
}

export async function closeConversationAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪║┘è╪▒ ┘à╪╡╪▒╪ص.') }
  }

  try {
    await loadConversation(ctx, conversationId)
    const { error } = await ctx.supabase
      .from('conversations')
      .update({
        status: 'closed',
        ai_enabled: false,
        state: 'closed',
        human_assignee_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'conversation.closed', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: '╪ز┘à ╪ح╪║┘╪د┘é ╪د┘┘à╪ص╪د╪»╪س╪ر. ┘┘ ┘è╪ذ╪»╪ث ╪د┘┘ê┘â┘è┘ ┘à╪ص╪د╪»╪س╪ر ╪ش╪»┘è╪»╪ر ┘à┘ ╪ز┘┘é╪د╪ة ┘┘╪│┘ç.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪ز╪╣╪░┘ّ╪▒ ╪ح╪║┘╪د┘é ╪د┘┘à╪ص╪د╪»╪س╪ر. ╪ص╪د┘ê┘ ┘à╪▒╪ر ╪ث╪«╪▒┘ë.') }
  }
}

export async function reopenConversationAction(conversationId: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪║┘è╪▒ ┘à╪╡╪▒╪ص.') }
  }

  try {
    await loadConversation(ctx, conversationId)
    // Re-opening is a staff decision and keeps the human in control, so the AI stays off.
    const { error } = await ctx.supabase
      .from('conversations')
      .update({ status: 'handed_off', ai_enabled: false, state: 'human_handoff', updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'conversation.reopened', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: '╪ز┘à╪ز ╪ح╪╣╪د╪»╪ر ┘╪ز╪ص ╪د┘┘à╪ص╪د╪»╪س╪ر╪î ┘ê╪د┘┘ê┘â┘è┘ ┘à╪د ╪▓╪د┘ ┘à╪ز┘ê┘é┘┘ï╪د.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪ز╪╣╪░┘ّ╪▒╪ز ╪ح╪╣╪د╪»╪ر ╪د┘┘╪ز╪ص. ╪ص╪د┘ê┘ ┘à╪▒╪ر ╪ث╪«╪▒┘ë.') }
  }
}

export async function addNoteAction(conversationId: string, body: string): Promise<InboxResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('inbox')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪║┘è╪▒ ┘à╪╡╪▒╪ص.') }
  }

  const note = body.trim()
  if (!note) return { ok: false, error: '╪د┘┘à┘╪د╪ص╪╕╪ر ┘╪د╪▒╪║╪ر.' }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    const memberId = await currentMemberId(ctx)
    if (!memberId) return { ok: false, error: '╪ز╪╣╪░┘ّ╪▒ ╪ز╪ص╪»┘è╪» ╪╣╪╢┘ê ╪د┘┘╪▒┘è┘é ╪د┘╪ص╪د┘┘è.' }

    // Notes live in their own table: they are staff context and must never reach the customer.
    const { error } = await ctx.supabase.from('conversation_notes').insert({
      organization_id: ctx.organizationId,
      conversation_id: conversation.id,
      author_id: memberId,
      body: note,
    })
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'conversation.note_added', 'conversation', conversationId)
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: '╪ز┘à╪ز ╪ح╪╢╪د┘╪ر ╪د┘┘à┘╪د╪ص╪╕╪ر.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, '╪ز╪╣╪░┘ّ╪▒ ╪ح╪╢╪د┘╪ر ╪د┘┘à┘╪د╪ص╪╕╪ر. ╪ص╪د┘ê┘ ┘à╪▒╪ر ╪ث╪«╪▒┘ë.') }
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
        
        // The trigger will automatically decrement the unread_count on conversations
        
        revalidatePath('/dashboard/conversations')
        revalidatePath(`/dashboard/conversations/${conversationId}`)
        return { ok: true }
    } catch (error) {
        return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث حالة القراءة.') }
    }
}
