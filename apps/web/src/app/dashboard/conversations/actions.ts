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
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const conversation = await loadConversation(ctx, conversationId)
    if (conversation.status === 'closed') {
      return { ok: false, error: 'المحادثة مغلقة، أعد فتحها قبل الاستلام.' }
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
    return { ok: true, message: 'تم استلام المحادثة. الوكيل متوقف ولن يرد حتى تستأنفه.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر استلام المحادثة. حاول مرة أخرى.') }
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
    return { ok: true, message: 'تمت إعادة الوكيل إلى المحادثة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر استئناف الوكيل. حاول مرة أخرى.') }
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
        human_assignee_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'conversation.closed', 'conversation', conversationId)
    revalidatePath('/dashboard/conversations')
    revalidatePath(`/dashboard/conversations/${conversationId}`)
    return { ok: true, message: 'تم إغلاق المحادثة. لن يبدأ الوكيل محادثة جديدة من تلقاء نفسه.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إغلاق المحادثة. حاول مرة أخرى.') }
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
    return { ok: true, message: 'تمت إعادة فتح المحادثة، والوكيل ما زال متوقفًا.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّرت إعادة الفتح. حاول مرة أخرى.') }
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
    return { ok: true, message: 'تمت إضافة الملاحظة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إضافة الملاحظة. حاول مرة أخرى.') }
  }
}

 e x p o r t   a s y n c   f u n c t i o n   m a r k A s R e a d A c t i o n ( c o n v e r s a t i o n I d :   s t r i n g ) :   P r o m i s e < I n b o x R e s u l t >   { 
     l e t   c t x :   A u t h o r i z e d C o n t e x t 
     t r y   { 
         c t x   =   a w a i t   r e q u i r e C a p a b i l i t y ( ' i n b o x ' ) 
     }   c a t c h   ( e r r o r )   { 
         r e t u r n   {   o k :   f a l s e ,   e r r o r :   a c t i o n E r r o r M e s s a g e ( e r r o r ,   ' :J1  E51-. ' )   } 
     } 
 
     t r y   { 
         a w a i t   l o a d C o n v e r s a t i o n ( c t x ,   c o n v e r s a t i o n I d ) 
 
         c o n s t   {   e r r o r :   m s g E r r o r   }   =   a w a i t   c t x . s u p a b a s e 
             . f r o m ( ' m e s s a g e s ' ) 
             . u p d a t e ( {   i s _ r e a d :   t r u e   } ) 
             . e q ( ' c o n v e r s a t i o n _ i d ' ,   c o n v e r s a t i o n I d ) 
             . e q ( ' o r g a n i z a t i o n _ i d ' ,   c t x . o r g a n i z a t i o n I d ) 
             . e q ( ' d i r e c t i o n ' ,   ' i n b o u n d ' ) 
             . e q ( ' i s _ r e a d ' ,   f a l s e ) 
 
         i f   ( m s g E r r o r )   r e t u r n   {   o k :   f a l s e ,   e r r o r :   s u p a b a s e A c t i o n E r r o r ( m s g E r r o r )   } 
         
         / /   T h e   t r i g g e r   w i l l   a u t o m a t i c a l l y   d e c r e m e n t   t h e   u n r e a d _ c o u n t   o n   c o n v e r s a t i o n s 
         
         r e v a l i d a t e P a t h ( ' / d a s h b o a r d / c o n v e r s a t i o n s ' ) 
         r e v a l i d a t e P a t h ( \ / d a s h b o a r d / c o n v e r s a t i o n s / \ \ ) 
         r e t u r n   {   o k :   t r u e   } 
     }   c a t c h   ( e r r o r )   { 
         r e t u r n   {   o k :   f a l s e ,   e r r o r :   a c t i o n E r r o r M e s s a g e ( e r r o r ,   ' *90Q1  *-/J+  -'D)  'DB1'!). ' )   } 
     } 
 }  
 