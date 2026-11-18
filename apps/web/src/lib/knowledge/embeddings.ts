export const KNOWLEDGE_EMBEDDING_MODEL = 'gemini-embedding-2'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 768

export type EmbeddingPurpose = 'query' | 'document'

export function formatKnowledgeEmbeddingInput(
  text: string,
  purpose: EmbeddingPurpose,
  title?: string
): string {
  const cleanText = text.trim()
  if (purpose === 'query') return `task: search result | query: ${cleanText}`
  return `title: ${title?.trim() || 'none'} | text: ${cleanText}`
}

/**
 * Uses the existing GEMINI_API_KEY. Returns null when embeddings are not configured
 * or the provider is temporarily unavailable, so lexical search and writes keep working.
 */
export async function embedKnowledgeText(
  text: string,
  purpose: EmbeddingPurpose,
  title?: string
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || process.env.NODE_ENV === 'test' || !text.trim()) return null

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${KNOWLEDGE_EMBEDDING_MODEL}:embedContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: `models/${KNOWLEDGE_EMBEDDING_MODEL}`,
          content: {
            parts: [{ text: formatKnowledgeEmbeddingInput(text, purpose, title) }],
          },
          output_dimensionality: KNOWLEDGE_EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    )

    if (!response.ok) {
      console.warn('Knowledge embedding request failed', { status: response.status })
      return null
    }

    const payload = (await response.json()) as {
      embedding?: { values?: unknown[] }
      embeddings?: Array<{ values?: unknown[] }>
    }
    const values = payload.embedding?.values ?? payload.embeddings?.[0]?.values
    if (!Array.isArray(values) || values.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) return null

    const vector = values.map(Number)
    return vector.every(Number.isFinite) ? vector : null
  } catch (error) {
    console.warn('Knowledge embedding request unavailable', {
      reason: error instanceof Error ? error.name : 'unknown',
    })
    return null
  }
}
