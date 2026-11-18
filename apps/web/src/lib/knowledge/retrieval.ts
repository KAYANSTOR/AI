import type { DbClient } from '@/lib/db/client'
export type KnowledgeMatch = { id: string; title: string; category: string; content: string; score: number }
function normalizeKnowledgeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[\u200B-\u200F\uFEFF]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}
const STOP_WORDS = new Set(['the','and','for','are','you','your','with','what','when','how','does','can','should','would','about','from','have','has','this','that','هل','ما','من','في','على','عن','الي','هو','هي','كيف','متي','اين'])
export function tokenize(query: string): string[] { return normalizeKnowledgeText(query).split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t)) }
function lexicalScore(title: string, content: string, tokens: string[], query: string): number {
  const t = normalizeKnowledgeText(title), c = normalizeKnowledgeText(content)
  let score = t === query ? 12 : t.includes(query) ? 8 : 0
  for (const token of tokens) score += (t.split(token).length - 1) * 5 + Math.min(c.split(token).length - 1, 5)
  return score
}
export async function searchKnowledge(db: DbClient, organizationId: string, query: string, options: { category?: string | null; limit?: number } = {}): Promise<KnowledgeMatch[]> {
  const normalized = normalizeKnowledgeText(query), tokens = tokenize(query)
  if (!tokens.length) return []
  const limit = Math.max(1, Math.min(options.limit ?? 8, 50))
  const { data: indexed, error } = await db.rpc('search_knowledge_base', { p_organization_id: organizationId, p_query: normalized, p_category: options.category ?? null, p_limit: limit })
  if (!error && Array.isArray(indexed)) return indexed.map((r: Record<string, unknown>) => ({ id: String(r.id), title: String(r.title ?? ''), category: String(r.category ?? 'general'), content: String(r.content ?? ''), score: Number(r.score ?? 0) }))
  // Fallback during staged deployments; page through all tenant rows rather than truncating at 200.
  const pageSize = 500, rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += pageSize) {
    let request = db.from('knowledge_base').select('id, title, content, category, is_active, updated_at').eq('organization_id', organizationId).eq('is_active', true).order('updated_at', { ascending: false }).range(offset, offset + pageSize - 1)
    if (options.category) request = request.eq('category', options.category)
    const result = await request
    if (result.error) throw new Error(result.error.message)
    rows.push(...(result.data ?? []))
    if (!result.data || result.data.length < pageSize) break
  }
  return rows.map((r) => ({ id: String(r.id), title: String(r.title ?? ''), category: String(r.category ?? 'general'), content: String(r.content ?? ''), score: lexicalScore(String(r.title ?? ''), String(r.content ?? ''), tokens, normalized) }))
    .filter((r) => r.score > 0).sort((a,b) => b.score-a.score || a.title.localeCompare(b.title)).slice(0,limit)
}
