'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { searchKnowledge } from '@/lib/knowledge/retrieval'

export type KnowledgeResult = { ok: boolean; error?: string; message?: string }

export type KnowledgeInput = {
  id?: string | null
  title: string
  content: string
  category?: string | null
}

const MAX_TITLE = 255

/** Allowed categories are stable identifiers so the agent filter stays predictable. */
export const KNOWLEDGE_CATEGORIES = [
  'general',
  'faq',
  'policy',
  'business_info',
  'service_info',
] as const

function normalizeCategory(value: string | null | undefined): string {
  const raw = (value ?? 'general').trim()
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(raw) ? raw : 'general'
}

export async function saveKnowledgeAction(input: KnowledgeInput): Promise<KnowledgeResult> {
  let ctx: AuthorizedContext
  try {
    // Disabling the capability removes the ability to change its data, not just its button.
    ctx = await requireAdminCapability('knowledge_base')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'غير مصرح.' }
  }

  const title = input.title?.trim()
  const content = input.content?.trim()
  if (!title) return { ok: false, error: 'العنوان مطلوب.' }
  if (!content) return { ok: false, error: 'المحتوى مطلوب.' }
  if (title.length > MAX_TITLE) return { ok: false, error: 'العنوان طويل جدًا.' }

  const payload = {
    organization_id: ctx.organizationId,
    title: title.slice(0, MAX_TITLE),
    content,
    category: normalizeCategory(input.category),
    is_active: true,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await ctx.supabase
      .from('knowledge_base')
      .update({ title: payload.title, content: payload.content, category: payload.category, updated_at: payload.updated_at })
      .eq('id', input.id)
      .eq('organization_id', ctx.organizationId)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'لم يتم العثور على المدخل.' }
    await audit(ctx, 'knowledge.updated', 'knowledge_base', data.id, { category: payload.category })
    revalidatePath('/dashboard/knowledge')
    return { ok: true, message: 'تم تحديث المدخل.' }
  }

  const { data, error } = await ctx.supabase.from('knowledge_base').insert(payload).select('id').single()
  if (error) return { ok: false, error: error.message }

  await audit(ctx, 'knowledge.created', 'knowledge_base', data.id, { category: payload.category })
  revalidatePath('/dashboard/knowledge')
  return { ok: true, message: 'تمت إضافة المدخل.' }
}

/** Deactivation keeps the entry visible for review while removing it from agent answers. */
export async function setKnowledgeActiveAction(id: string, isActive: boolean): Promise<KnowledgeResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability('knowledge_base')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'غير مصرح.' }
  }

  const { data, error } = await ctx.supabase
    .from('knowledge_base')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'لم يتم العثور على المدخل.' }

  await audit(ctx, isActive ? 'knowledge.activated' : 'knowledge.deactivated', 'knowledge_base', id)
  revalidatePath('/dashboard/knowledge')
  return { ok: true, message: isActive ? 'تم تفعيل المدخل.' : 'تم تعطيل المدخل، ولن يستخدمه الوكيل.' }
}

/**
 * Runs the very same retrieval the agent tool uses, server-side and inside the caller's
 * tenant, so the operator sees exactly what the agent would find. The client never queries
 * the database itself.
 */
export async function previewKnowledgeAction(query: string): Promise<{
  ok: boolean
  titles?: string[]
  error?: string
}> {
  try {
    const ctx = await requireAdminCapability('knowledge_base')
    const trimmed = query.trim()
    if (trimmed.length < 2) return { ok: false, error: 'اكتب كلمة بحث أطول.' }
    const matches = await searchKnowledge(ctx.supabase, ctx.organizationId, trimmed)
    return { ok: true, titles: matches.map((match) => match.title) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر تنفيذ البحث.' }
  }
}

export async function deleteKnowledgeAction(id: string): Promise<KnowledgeResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability('knowledge_base')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'غير مصرح.' }
  }

  const { error } = await ctx.supabase
    .from('knowledge_base')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
  if (error) return { ok: false, error: error.message }

  await audit(ctx, 'knowledge.deleted', 'knowledge_base', id)
  revalidatePath('/dashboard/knowledge')
  return { ok: true, message: 'تم حذف المدخل.' }
}
