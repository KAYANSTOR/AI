'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type CannedResult = { ok: true; id?: string } | { ok: false; error: string }

export async function createCannedReplyAction(input: {
  title: string
  body: string
  shortcut?: string
  channel?: string
}): Promise<CannedResult> {
  try {
    const ctx = await requireAdminCapability('inbox')
    const title = input.title.trim()
    const body = input.body.trim()
    if (!title) return { ok: false, error: 'العنوان مطلوب.' }
    if (!body) return { ok: false, error: 'نص الرد مطلوب.' }

    const { data, error } = await ctx.supabase
      .from('canned_replies')
      .insert({
        organization_id: ctx.organizationId,
        title,
        body,
        shortcut: input.shortcut?.trim() || null,
        channel: input.channel?.trim() || null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'canned_reply.created', 'canned_reply', data.id)
    revalidatePath('/dashboard/settings/canned-replies')
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحفظ.') }
  }
}

export async function deactivateCannedReplyAction(id: string): Promise<CannedResult> {
  try {
    const ctx = await requireAdminCapability('inbox')
    const { error } = await ctx.supabase
      .from('canned_replies')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }
    await audit(ctx, 'canned_reply.deactivated', 'canned_reply', id)
    revalidatePath('/dashboard/settings/canned-replies')
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر التعطيل.') }
  }
}
