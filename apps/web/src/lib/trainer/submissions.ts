import type { DbClient } from '@/lib/db/client'
import { canonicalJson, hashesEqual, payloadHash } from '@/lib/personal-assistant/executive/hash'
import { knowledgeContentHash } from '@/lib/knowledge/layer'
import { KNOWLEDGE_EMBEDDING_MODEL } from '@/lib/knowledge/embeddings'
import { memoryContentHash } from '@/lib/personal-assistant/memory-normalize'
import { itemToText, type TrainingDraft } from './extract'
import type { TrainingTarget } from './checklists'

/**
 * Extract -> Preview -> Confirm -> Index.
 *
 * A submission is a draft until an owner/admin confirms it. Confirmation carries the
 * SHA-256 of the exact draft that was previewed; if the draft changed (edit) or the
 * hash was forged, nothing is indexed. Every query is scoped by the caller's org (and
 * user for personal memory), never by an id alone.
 */
export type Owner = { organizationId: string; userId: string }
export type InputType = 'text' | 'voice' | 'image' | 'document'
export type SubmissionChannel = 'whatsapp_central' | 'whatsapp_trainer' | 'web'
export type SubmissionStatus = 'pending' | 'indexing' | 'indexed' | 'cancelled' | 'failed'

export type IndexDeps = {
  now?: () => Date
  embed?: (text: string, title: string) => Promise<number[] | null>
}

const MEMORY_CATEGORY: Record<string, string> = { fact: 'fact', preference: 'preference', contact: 'contact', project: 'project', document: 'document' }

function nowOf(deps: { now?: () => Date }) { return deps.now ? deps.now() : new Date() }

export function draftHash(draft: Pick<TrainingDraft, 'items'>, target: TrainingTarget) {
  return payloadHash({ target, items: draft.items })
}

export async function createSubmission(db: DbClient, owner: Owner, input: {
  channel: SubmissionChannel
  inputType: InputType
  target: TrainingTarget
  draft: TrainingDraft
  externalMessageId?: string | null
  sourceExcerpt?: string
  mediaMime?: string | null
  fileName?: string | null
}): Promise<{ id: string; hash: string } | { duplicate: true }> {
  const hash = draftHash(input.draft, input.target)
  const { data, error } = await db.from('whatsapp_training_submissions').insert({
    org_id: owner.organizationId,
    user_id: owner.userId,
    channel: input.channel,
    input_type: input.inputType,
    target: input.target,
    status: 'pending',
    external_message_id: input.externalMessageId ?? null,
    source_excerpt: (input.sourceExcerpt ?? '').slice(0, 2000),
    media_mime: input.mediaMime ?? null,
    file_name: input.fileName ? input.fileName.slice(0, 200) : null,
    draft: JSON.parse(canonicalJson(input.draft)),
    flagged: input.draft.flagged,
    checklist_key: input.draft.checklistKey,
    payload_hash: hash,
  }).select('id').single()
  if (error?.code === '23505') return { duplicate: true }
  if (error || !data) throw new Error('training_submission_failed')
  return { id: String(data.id), hash }
}

/** Loads a submission only inside the caller's scope (memory drafts are per user). */
export async function loadOwnedSubmission(db: DbClient, owner: Owner, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await db.from('whatsapp_training_submissions').select('*')
    .eq('id', id).eq('org_id', owner.organizationId).maybeSingle()
  if (!data) return null
  if (data.target === 'memory' && String(data.user_id) !== owner.userId) return null
  return data as Record<string, unknown>
}

export async function replaceDraft(db: DbClient, owner: Owner, id: string, draft: TrainingDraft, sourceExcerpt: string) {
  const row = await loadOwnedSubmission(db, owner, id)
  if (!row || row.status !== 'pending') return null
  const hash = draftHash(draft, row.target as TrainingTarget)
  const { data } = await db.from('whatsapp_training_submissions').update({
    draft: JSON.parse(canonicalJson(draft)),
    flagged: draft.flagged,
    checklist_key: draft.checklistKey,
    payload_hash: hash,
    source_excerpt: sourceExcerpt.slice(0, 2000),
  }).eq('id', id).eq('org_id', owner.organizationId).eq('status', 'pending').select('id')
  return Array.isArray(data) && data.length ? { id, hash } : null
}

export type ApprovalResult =
  | { status: 'indexed'; refs: string[]; target: TrainingTarget }
  | { status: 'not_found' | 'hash_mismatch' | 'already_decided' | 'failed' }

async function indexKnowledge(db: DbClient, owner: Owner, draft: TrainingDraft, deps: IndexDeps) {
  const refs: string[] = []
  for (const entry of draft.items) {
    const content = itemToText(entry)
    const embedding = deps.embed ? await deps.embed(content, entry.title) : null
    const { data, error } = await db.from('knowledge_base').insert({
      organization_id: owner.organizationId,
      title: entry.title.slice(0, 255),
      content,
      content_hash: knowledgeContentHash(content),
      content_embedding: embedding,
      embedding_model: embedding ? KNOWLEDGE_EMBEDDING_MODEL : null,
      source_type: 'training',
      category: entry.category,
      is_active: true,
      updated_at: nowOf(deps).toISOString(),
    }).select('id').single()
    if (error?.code === '23505') continue // identical fact already in the knowledge base
    if (error || !data) throw new Error('knowledge_index_failed')
    refs.push(String(data.id))
  }
  return refs
}

async function indexMemory(db: DbClient, owner: Owner, draft: TrainingDraft, deps: IndexDeps) {
  const refs: string[] = []
  for (const entry of draft.items) {
    const content = itemToText(entry).slice(0, 500)
    const embedding = deps.embed ? await deps.embed(content, 'Personal memory') : null
    const { data, error } = await db.from('user_memories').insert({
      organization_id: owner.organizationId,
      user_id: owner.userId,
      category: MEMORY_CATEGORY[entry.category] ?? 'fact',
      content,
      content_hash: memoryContentHash(content),
      content_embedding: embedding,
      embedding_model: embedding ? KNOWLEDGE_EMBEDDING_MODEL : null,
      confidence: 0.95,
    }).select('id').single()
    if (error?.code === '23505') continue
    if (error || !data) throw new Error('memory_index_failed')
    refs.push(String(data.id))
  }
  return refs
}

export async function approveSubmission(
  db: DbClient,
  owner: Owner,
  input: { id: string; hash: string; via: 'whatsapp' | 'web' },
  deps: IndexDeps
): Promise<ApprovalResult> {
  const row = await loadOwnedSubmission(db, owner, input.id)
  if (!row) return { status: 'not_found' }
  if (row.status !== 'pending') return { status: 'already_decided' }
  if (!hashesEqual(String(row.payload_hash ?? ''), input.hash)) return { status: 'hash_mismatch' }
  const draft = row.draft as TrainingDraft
  const target = row.target as TrainingTarget
  // Re-derive the hash from the stored draft: a tampered row cannot be indexed either.
  if (!hashesEqual(draftHash(draft, target), String(row.payload_hash))) return { status: 'hash_mismatch' }

  // Claim atomically so two taps (web + WhatsApp) cannot index twice.
  const { data: claimed } = await db.from('whatsapp_training_submissions')
    .update({ status: 'indexing', decided_by: owner.userId, decided_via: input.via, decided_at: nowOf(deps).toISOString() })
    .eq('id', input.id).eq('org_id', owner.organizationId).eq('status', 'pending').eq('payload_hash', input.hash)
    .select('id')
  if (!Array.isArray(claimed) || !claimed.length) return { status: 'already_decided' }

  try {
    const refs = target === 'memory'
      ? await indexMemory(db, owner, draft, deps)
      : await indexKnowledge(db, owner, draft, deps)
    await db.from('whatsapp_training_submissions')
      .update({ status: 'indexed', indexed_refs: refs, indexed_at: nowOf(deps).toISOString() })
      .eq('id', input.id).eq('org_id', owner.organizationId)
    return { status: 'indexed', refs, target }
  } catch (error) {
    await db.from('whatsapp_training_submissions')
      .update({ status: 'failed', last_error: error instanceof Error ? error.message.slice(0, 200) : 'index_failed' })
      .eq('id', input.id).eq('org_id', owner.organizationId)
    return { status: 'failed' }
  }
}

export async function cancelSubmission(db: DbClient, owner: Owner, id: string, via: 'whatsapp' | 'web', deps: IndexDeps = {}) {
  const row = await loadOwnedSubmission(db, owner, id)
  if (!row) return 'not_found' as const
  if (row.status !== 'pending') return 'already_decided' as const
  const { data } = await db.from('whatsapp_training_submissions')
    .update({ status: 'cancelled', decided_by: owner.userId, decided_via: via, decided_at: nowOf(deps).toISOString() })
    .eq('id', id).eq('org_id', owner.organizationId).eq('status', 'pending').select('id')
  return Array.isArray(data) && data.length ? 'cancelled' as const : 'already_decided' as const
}

/**
 * Deletes a draft from the training log. Indexed entries keep their knowledge (manage
 * those from the knowledge list, which keeps revisions); only the log row is removed.
 */
export async function deleteSubmission(db: DbClient, owner: Owner, id: string) {
  const row = await loadOwnedSubmission(db, owner, id)
  if (!row) return 'not_found' as const
  if (row.status === 'indexing') return 'busy' as const
  await db.from('whatsapp_training_submissions').delete().eq('id', id).eq('org_id', owner.organizationId)
  return 'deleted' as const
}

export async function listSubmissions(db: DbClient, owner: Owner, limit = 20) {
  const { data } = await db.from('whatsapp_training_submissions')
    .select('id, user_id, channel, input_type, target, status, draft, flagged, checklist_key, payload_hash, file_name, created_at, decided_at')
    .eq('org_id', owner.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit * 2)
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => row.target !== 'memory' || String(row.user_id) === owner.userId)
    .slice(0, limit)
}
