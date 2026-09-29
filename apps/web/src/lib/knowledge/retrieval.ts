import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Knowledge retrieval.
 *
 * Deliberately lexical, not semantic: the project's knowledge_base has no embeddings
 * today, and inventing an answer from a weak match would be worse than admitting the
 * knowledge base does not cover the question. Every query is filtered by
 * `organization_id`, so a tenant can never read another tenant's knowledge.
 */
export type KnowledgeMatch = {
  id: string
  title: string
  category: string
  content: string
  score: number
}

const MAX_CANDIDATES = 200
const MAX_MATCHES = 5
/** Common words are dropped so a match means something. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'you', 'your', 'with', 'what', 'when', 'how', 'does',
  'can', 'should', 'would', 'about', 'from', 'have', 'has', 'this', 'that', 'هل',
  'ما', 'من', 'في', 'على', 'عن', 'إلى', 'الى', 'هو', 'هي', 'كيف', 'متى', 'أين', 'اين',
])

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

/**
 * Ranks active knowledge entries for the organization against the query.
 * Returns [] when nothing genuinely matches, so callers can say "not covered"
 * instead of guessing.
 */
export async function searchKnowledge(
  supabase: SupabaseClient,
  organizationId: string,
  query: string,
  options: { category?: string | null; limit?: number } = {}
): Promise<KnowledgeMatch[]> {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  let request = supabase
    .from('knowledge_base')
    .select('id, title, content, category, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(MAX_CANDIDATES)

  if (options.category) request = request.eq('category', options.category)

  const { data, error } = await request
  if (error) throw new Error(error.message)

  const scored: KnowledgeMatch[] = []
  for (const row of data ?? []) {
    const title = String(row.title ?? '')
    const content = String(row.content ?? '')
    const haystack = (title + ' ' + content).toLowerCase()
    let score = 0
    for (const token of tokens) {
      const occurrences = haystack.split(token).length - 1
      if (occurrences === 0) continue
      // A term in the title means the entry is about that term.
      score += occurrences + (title.toLowerCase().includes(token) ? 3 : 0)
    }
    if (score > 0) {
      scored.push({
        id: row.id as string,
        title,
        category: String(row.category ?? 'general'),
        content,
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return scored.slice(0, options.limit ?? MAX_MATCHES)
}
