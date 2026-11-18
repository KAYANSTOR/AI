'use server'

import { revalidatePath } from 'next/cache'
import { KNOWLEDGE_CATEGORIES } from './categories'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { searchKnowledge } from '@/lib/knowledge/retrieval'
import { knowledgeContentHash } from '@/lib/knowledge/layer'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'

export type KnowledgeResult = { ok: boolean; error?: string; message?: string }

export type KnowledgeInput = {
  id?: string | null
  title: string
  content: string
  category?: string | null
}

const MAX_TITLE = 255


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
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
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
    const { data, error } = await ctx.db.rpc('update_knowledge_with_revision', {
      p_organization_id: ctx.organizationId,
      p_knowledge_id: input.id,
      p_title: payload.title,
      p_content: payload.content,
      p_category: payload.category,
      p_change_reason: 'تعديل يدوي من لوحة المعرفة',
      p_change_type: 'update',
    })
    if (error) return { ok: false, error: dbActionError(error) }
    if (!data) return { ok: false, error: 'لم يتم العثور على المدخل.' }
    await audit(ctx, 'knowledge.updated', 'knowledge_base', input.id, { category: payload.category, revisioned: true })
    revalidatePath('/dashboard/knowledge')
    return { ok: true, message: 'تم تحديث المدخل.' }
  }

  const { data, error } = await ctx.db.from('knowledge_base').insert(payload).select('id').single()
  if (error) return { ok: false, error: dbActionError(error) }

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
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const { data, error } = await ctx.db.rpc('set_knowledge_active_with_revision', {
    p_organization_id: ctx.organizationId,
    p_knowledge_id: id,
    p_is_active: isActive,
    p_change_reason: isActive ? 'إعادة تفعيل من لوحة المعرفة' : 'أرشفة من لوحة المعرفة',
  })
  if (error) return { ok: false, error: dbActionError(error) }
  if (!data) return { ok: false, error: 'لم يتم العثور على المدخل.' }

  await audit(ctx, isActive ? 'knowledge.activated' : 'knowledge.archived', 'knowledge_base', id)
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
    const matches = await searchKnowledge(ctx.db, ctx.organizationId, trimmed)
    return { ok: true, titles: matches.map((match) => match.title) }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تنفيذ البحث. حاول مرة أخرى.') }
  }
}

export async function deleteKnowledgeAction(id: string): Promise<KnowledgeResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability('knowledge_base')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const { data, error } = await ctx.db.rpc('set_knowledge_active_with_revision', {
    p_organization_id: ctx.organizationId,
    p_knowledge_id: id,
    p_is_active: false,
    p_change_reason: 'أرشفة من لوحة المعرفة',
  })
  if (error) return { ok: false, error: dbActionError(error) }
  if (!data) return { ok: false, error: 'لم يتم العثور على المدخل.' }

  await audit(ctx, 'knowledge.archived', 'knowledge_base', id)
  revalidatePath('/dashboard/knowledge')
  return { ok: true, message: 'تمت أرشفة المدخل مع الاحتفاظ بسجله.' }
}


export type KnowledgeRevision = {
  id: string
  revision_number: number
  title: string
  content: string
  category: string
  is_active: boolean
  change_type: string
  change_reason: string | null
  created_at: string
}

export async function getKnowledgeRevisionsAction(id: string): Promise<{ ok: boolean; revisions?: KnowledgeRevision[]; error?: string }> {
  try {
    const ctx = await requireAdminCapability('knowledge_base')
    const { data, error } = await ctx.db
      .from('knowledge_revisions')
      .select('id, revision_number, title, content, category, is_active, change_type, change_reason, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('knowledge_id', id)
      .order('revision_number', { ascending: false })
      .limit(30)
    if (error) return { ok: false, error: dbActionError(error) }
    return { ok: true, revisions: (data ?? []) as KnowledgeRevision[] }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحميل سجل الإصدارات.') }
  }
}

export async function restoreKnowledgeRevisionAction(id: string, revisionId: string): Promise<KnowledgeResult> {
  try {
    const ctx = await requireAdminCapability('knowledge_base')
    const { data: revision, error: revisionError } = await ctx.db
      .from('knowledge_revisions')
      .select('title, content, category')
      .eq('id', revisionId)
      .eq('knowledge_id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (revisionError) return { ok: false, error: dbActionError(revisionError) }
    if (!revision) return { ok: false, error: 'الإصدار المطلوب غير موجود.' }

    const { data, error } = await ctx.db.rpc('update_knowledge_with_revision', {
      p_organization_id: ctx.organizationId,
      p_knowledge_id: id,
      p_title: revision.title,
      p_content: revision.content,
      p_category: revision.category,
      p_change_reason: `استعادة الإصدار ${revisionId}`,
      p_change_type: 'restore',
    })
    if (error) return { ok: false, error: dbActionError(error) }
    if (!data) return { ok: false, error: 'تعذّرت استعادة الإصدار.' }
    await audit(ctx, 'knowledge.restored', 'knowledge_base', id, { revisionId })
    revalidatePath('/dashboard/knowledge')
    return { ok: true, message: 'تمت استعادة الإصدار مع الاحتفاظ بالحالة السابقة في السجل.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّرت استعادة الإصدار.') }
  }
}


/** Imports plain-text knowledge files. Original text and all chunks commit atomically in PostgreSQL. */
export async function uploadKnowledgeDocumentAction(formData: FormData): Promise<KnowledgeResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability('knowledge_base')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'اختر ملفاً أولاً.' }
  const extension = file.name.toLowerCase().split('.').pop()
  const allowed = new Set(['txt', 'md', 'csv'])
  if (!extension || !allowed.has(extension)) return { ok: false, error: 'الصيغ المدعومة حالياً: TXT وMD وCSV.' }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return { ok: false, error: 'حجم الملف يجب أن يكون أقل من 5 ميجابايت.' }

  let originalText: string
  try {
    originalText = (await file.text()).replace(/^\uFEFF/, '').trim()
  } catch {
    return { ok: false, error: 'تعذّر قراءة الملف النصي.' }
  }
  if (!originalText) return { ok: false, error: 'الملف لا يحتوي على نص قابل للقراءة.' }

  const contentHash = knowledgeContentHash(originalText)
  const { data: existing, error: lookupError } = await ctx.db
    .from('knowledge_documents')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (lookupError) return { ok: false, error: dbActionError(lookupError) }
  if (existing?.id) return { ok: true, message: 'هذا المستند محفوظ مسبقاً ولم تتم إضافته مرة أخرى.' }

  const paragraphs = originalText.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const chunks: Array<{ chunk_index: number; content: string; content_hash: string }> = []
  let current = ''
  const pushChunk = () => {
    if (!current.trim()) return
    const content = current.trim()
    chunks.push({ chunk_index: chunks.length, content, content_hash: knowledgeContentHash(content) })
    current = ''
  }
  for (const paragraph of paragraphs.length ? paragraphs : [originalText]) {
    if (paragraph.length > 1400) {
      pushChunk()
      for (let offset = 0; offset < paragraph.length; offset += 1250) {
        const content = paragraph.slice(offset, offset + 1400).trim()
        if (content) chunks.push({ chunk_index: chunks.length, content, content_hash: knowledgeContentHash(content) })
      }
      continue
    }
    if (current && current.length + paragraph.length + 2 > 1400) pushChunk()
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  pushChunk()

  const { data, error } = await ctx.db.rpc('ingest_knowledge_document', {
    p_organization_id: ctx.organizationId,
    p_file_name: file.name,
    p_mime_type: file.type || 'text/plain',
    p_content_hash: contentHash,
    p_original_text: originalText,
    p_chunks: chunks,
  })
  if (error) return { ok: false, error: dbActionError(error) }
  if (!data) return { ok: false, error: 'لم يتم حفظ المستند.' }

  await audit(ctx, 'knowledge.document_ingested', 'knowledge_documents', String(data), { fileName: file.name, chunks: chunks.length })
  revalidatePath('/dashboard/knowledge')
  return { ok: true, message: `تم حفظ المستند وتقسيمه إلى ${chunks.length} مقطعاً قابلاً للبحث.` }
}
