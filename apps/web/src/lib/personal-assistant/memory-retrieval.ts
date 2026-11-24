import type { DbClient } from '@/lib/db/client'
import { embedKnowledgeText } from '@/lib/knowledge/embeddings'
import { memoryContentHash } from './memory-normalize'

export type PersonalMemory = {
  id: string
  category: string
  content: string
  confidence: number
  content_embedding?: number[] | null
  updated_at: string
}

function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

export async function retrievePersonalMemories(db: DbClient, owner: { organizationId: string; userId: string }, query: string, limit = 8) {
  const clean = query.trim()
  if (!clean) return [] as PersonalMemory[]
  const { data, error } = await db.from('user_memories')
    .select('id, category, content, confidence, content_embedding, updated_at')
    .eq('organization_id', owner.organizationId).eq('user_id', owner.userId)
    .order('updated_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PersonalMemory[]
  const queryEmbedding = await embedKnowledgeText(clean, 'query', 'Personal assistant query')
  const tokens = clean.toLocaleLowerCase('ar').split(/\s+/).filter((token) => token.length > 1)
  const scored = rows.map((row) => {
    const lexical = tokens.reduce((score, token) => score + (row.content.toLocaleLowerCase('ar').includes(token) ? 1 : 0), 0)
    const semantic = queryEmbedding && Array.isArray(row.content_embedding) ? cosine(queryEmbedding, row.content_embedding) : 0
    return { row, score: lexical * 0.2 + semantic * 0.8 + Number(row.confidence || 0) * 0.01 }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ row }) => row)
}

export async function savePersonalMemory(db: DbClient, owner: { organizationId: string; userId: string }, input: { category: string; content: string; confidence?: number }) {
  const content = input.content.trim().slice(0, 500)
  if (!content) throw new Error('empty_memory')
  if (!['fact', 'preference', 'contact', 'project', 'document'].includes(input.category)) throw new Error('invalid_memory_category')
  const embedding = await embedKnowledgeText(content, 'document', 'Personal memory')
  const { data, error } = await db.from('user_memories').upsert({
    organization_id: owner.organizationId,
    user_id: owner.userId,
    category: input.category,
    content,
    content_hash: memoryContentHash(content),
    content_embedding: embedding,
    embedding_model: embedding ? 'gemini-embedding-2' : null,
    confidence: Math.min(1, Math.max(0, input.confidence ?? 0.85)),
  }, { onConflict: 'organization_id,user_id,content_hash' }).select('id, category, content, confidence, updated_at').single()
  if (error || !data) throw new Error(error?.message ?? 'memory_save_failed')
  return data
}
