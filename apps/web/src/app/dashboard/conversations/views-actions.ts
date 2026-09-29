'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type ViewResult = { ok: true; id?: string } | { ok: false; error: string }

export type InboxFilters = {
  status?: string | null
  q?: string | null
  channel?: string | null
  unreadOnly?: boolean
}

export async function saveInboxViewAction(input: {
  name: string
  filters: InboxFilters
  isShared?: boolean
}): Promise<ViewResult> {
  try {
    const ctx = await requireCapability('inbox')
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'الاسم مطلوب.' }

    const { data: member } = await ctx.supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    const { data, error } = await ctx.supabase
      .from('saved_inbox_views')
      .insert({
        organization_id: ctx.organizationId,
        member_id: member?.id ?? null,
        name,
        filters: input.filters,
        is_shared: Boolean(input.isShared),
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'inbox_view.saved', 'saved_inbox_view', data.id)
    revalidatePath('/dashboard/conversations')
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحفظ.') }
  }
}

export async function deleteInboxViewAction(viewId: string): Promise<ViewResult> {
  try {
    const ctx = await requireCapability('inbox')
    const { error } = await ctx.supabase
      .from('saved_inbox_views')
      .delete()
      .eq('id', viewId)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'inbox_view.deleted', 'saved_inbox_view', viewId)
    revalidatePath('/dashboard/conversations')
    return { ok: true, id: viewId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحذف.') }
  }
}
