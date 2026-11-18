'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { KNOWLEDGE_CATEGORIES } from './categories'
import { requireAdminCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { searchKnowledge } from '@/lib/knowledge/retrieval'
import { knowledgeContentHash } from '@/lib/knowledge/layer'
import { embedKnowledgeText, KNOWLEDGE_EMBEDDING_MODEL } from '@/lib/knowledge/embeddings'
import { extractDocxText } from '@/lib/knowledge/document-parser'
import { extractPdfText } from '@/lib/knowledge/pdf-extractor'
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

  const contentEmbedding = await embedKnowledgeText(content, 'document', title)
  const payload = {
    organization_id: ctx.organizationId,
    title: title.slice(0, MAX_TITLE),
    content,
    content_hash: knowledgeContentHash(content),
    content_embedding: contentEmbedding,
    embedding_model: contentEmbedding ? KNOWLEDGE_EMBEDDING_MODEL : null,
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
      p_content_hash: payload.content_hash,
      p_content_embedding: payload.content_embedding,
      p_embedding_model: payload.embedding_model,
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
      p_content_hash: knowledgeContentHash(revision.content),
      p_content_embedding: await embedKnowledgeText(revision.content, 'document', revision.title),
      p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL,
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
  const allowed = new Set(['txt', 'md', 'csv', 'docx', 'pdf'])
  if (!extension || !allowed.has(extension)) {
    return { ok: false, error: 'الصيغ المدعومة: TXT وMD وCSV وDOCX وPDF.' }
  }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'حجم الملف يجب ألا يتجاوز 5 ميجابايت.' }
  }

  let fileBytes: Buffer
  let originalText: string
  try {
    fileBytes = Buffer.from(await file.arrayBuffer())
    if (extension === 'pdf') {
      if (fileBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return { ok: false, error: 'محتوى الملف لا يطابق صيغة PDF.' }
      }
      originalText = await extractPdfText(fileBytes)
    } else if (extension === 'docx') {
      if (fileBytes.length < 4 || fileBytes.readUInt32LE(0) !== 0x04034b50) {
        return { ok: false, error: 'محتوى الملف لا يطابق صيغة DOCX.' }
      }
      originalText = extractDocxText(fileBytes)
    } else {
      if (fileBytes.includes(0)) return { ok: false, error: 'الملف النصي يحتوي على بيانات ثنائية غير مدعومة.' }
      originalText = new TextDecoder('utf-8', { fatal: true }).decode(fileBytes).replace(/^\uFEFF/, '')
    }
    originalText = originalText.trim()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّرت قراءة محتوى المستند.' }
  }

  if (!originalText) return { ok: false, error: 'الملف لا يحتوي على نص قابل للقراءة.' }
  if (originalText.length > 200_000) {
    return { ok: false, error: 'المستند كبير جداً بعد استخراج النص. قسّمه إلى ملفات أصغر (حد النص 200 ألف حرف).' }
  }

  const contentHash = createHash('sha256').update(fileBytes).digest('hex')
  const { data: existing, error: lookupError } = await ctx.db
    .from('knowledge_documents')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (lookupError) return { ok: false, error: dbActionError(lookupError) }
  if (existing?.id) return { ok: true, message: 'هذا الملف محفوظ مسبقاً ولم تتم إضافته مرة أخرى.' }

  const paragraphs = originalText.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const chunks: Array<{ chunk_index: number; content: string; content_hash: string }> = []
  let current = ''
  const pushChunk = () => {
    if (!current.trim()) return
    const chunkContent = current.trim()
    chunks.push({ chunk_index: chunks.length, content: chunkContent, content_hash: knowledgeContentHash(chunkContent) })
    current = ''
  }
  for (const paragraph of paragraphs.length ? paragraphs : [originalText]) {
    if (paragraph.length > 3000) {
      pushChunk()
      for (let offset = 0; offset < paragraph.length; offset += 2700) {
        const chunkContent = paragraph.slice(offset, offset + 3000).trim()
        if (chunkContent) chunks.push({ chunk_index: chunks.length, content: chunkContent, content_hash: knowledgeContentHash(chunkContent) })
      }
      continue
    }
    if (current && current.length + paragraph.length + 2 > 3000) pushChunk()
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  pushChunk()

  const indexedChunks: Array<{
    chunk_index: number
    content: string
    content_hash: string
    content_embedding: number[] | null
    embedding_model: string | null
  }> = []
  for (let offset = 0; offset < chunks.length; offset += 3) {
    const batch = await Promise.all(chunks.slice(offset, offset + 3).map(async (chunk) => {
      const vector = await embedKnowledgeText(chunk.content, 'document', file.name)
      return {
        ...chunk,
        content_embedding: vector,
        embedding_model: vector ? KNOWLEDGE_EMBEDDING_MODEL : null,
      }
    }))
    indexedChunks.push(...batch)
  }

  const mimeType = extension === 'pdf'
    ? 'application/pdf'
    : extension === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : extension === 'csv'
        ? 'text/csv'
        : extension === 'md'
          ? 'text/markdown'
          : 'text/plain'

  const { data, error } = await ctx.db.rpc('ingest_knowledge_document', {
    p_organization_id: ctx.organizationId,
    p_file_name: file.name,
    p_mime_type: mimeType,
    p_content_hash: contentHash,
    p_original_text: originalText,
    p_original_file_base64: fileBytes.toString('base64'),
    p_chunks: indexedChunks,
  })
  if (error) return { ok: false, error: dbActionError(error) }
  if (!data) return { ok: false, error: 'لم يتم حفظ المستند.' }

  const embeddedCount = indexedChunks.filter((chunk) => chunk.content_embedding).length
  await audit(ctx, 'knowledge.document_ingested', 'knowledge_documents', String(data), {
    fileName: file.name,
    chunks: chunks.length,
    embeddedChunks: embeddedCount,
  })
  revalidatePath('/dashboard/knowledge')
  return {
    ok: true,
    message: `تم حفظ الملف الأصلي واستخراج النص وتقسيمه إلى ${chunks.length} مقطعاً. تمت فهرسة ${embeddedCount} مقطعاً دلالياً.`,
  }
}


export async function indexLegacyKnowledgeEmbeddingsAction(): Promise<{
  ok: boolean
  indexed?: number
  remaining?: number
  error?: string
}> {
  try {
    const ctx = await requireAdminCapability('knowledge_base')
    if (!process.env.GEMINI_API_KEY?.trim()) {
      return { ok: false, error: 'أضف GEMINI_API_KEY إلى إعدادات الخادم لتفعيل الفهرسة الدلالية.' }
    }
    const { data: rows, error } = await ctx.db
      .from('knowledge_base')
      .select('id, title, content')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .is('content_embedding', null)
      .order('created_at', { ascending: true })
      .limit(10)
    if (error) return { ok: false, error: dbActionError(error) }

    let indexed = 0
    for (const row of rows ?? []) {
      const vector = await embedKnowledgeText(String(row.content ?? ''), 'document', String(row.title ?? ''))
      if (!vector) break
      const result = await ctx.db
        .from('knowledge_base')
        .update({ content_embedding: vector, embedding_model: KNOWLEDGE_EMBEDDING_MODEL })
        .eq('id', row.id)
        .eq('organization_id', ctx.organizationId)
        .is('content_embedding', null)
        .select('id')
      if (result.error) return { ok: false, error: dbActionError(result.error) }
      if (result.data?.length) indexed += 1
    }

    const { count, error: countError } = await ctx.db
      .from('knowledge_base')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .is('content_embedding', null)
    if (countError) return { ok: false, error: dbActionError(countError) }
    revalidatePath('/dashboard/knowledge')
    return { ok: true, indexed, remaining: count ?? 0 }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّرت فهرسة السجلات القديمة.') }
  }
}
