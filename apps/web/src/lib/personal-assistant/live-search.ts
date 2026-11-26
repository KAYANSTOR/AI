import { stripInjection } from '@/lib/trainer/extract'
import { wrapUntrusted } from './executive/policy'

export type LiveSearchItem = {
  title: string
  snippet: string
  url: string
}

export type LiveSearchResult =
  | {
      ok: true
      query: string
      summary: string
      results: LiveSearchItem[]
      flagged: boolean
      source: 'gemini_grounding' | 'duckduckgo'
      untrustedContext: string
    }
  | {
      ok: false
      code: 'invalid_query' | 'search_timeout' | 'search_unavailable'
      messageAr: string
    }

export type LiveSearchDeps = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  preferDuckDuckGo?: boolean
}

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_QUERY_CHARS = 300
const MAX_RESULTS = 5

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u0000/g, '')
    .split('<<UNTRUSTED_DATA>>').join('')
    .split('<</UNTRUSTED_DATA>>').join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, max)
}

function safePublicResultUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = new URL(raw.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.name === 'TimeoutError' || /timeout|aborted/i.test(error.message)
}

function sanitizeSearchItems(rawItems: Array<{ title?: unknown; snippet?: unknown; url?: unknown }>): {
  items: LiveSearchItem[]
  flagged: boolean
} {
  let flagged = false
  const items: LiveSearchItem[] = []
  for (const entry of rawItems) {
    if (items.length >= MAX_RESULTS) break
    const url = safePublicResultUrl(entry.url)
    if (!url) continue
    const titleCleaned = stripInjection(cleanText(entry.title, 160))
    const snippetCleaned = stripInjection(cleanText(entry.snippet, 400))
    if (titleCleaned.flagged || snippetCleaned.flagged) flagged = true
    const title = titleCleaned.text || url
    const snippet = snippetCleaned.text
    if (!snippet && !title) continue
    items.push({ title, snippet, url })
  }
  return { items, flagged }
}

async function searchWithGeminiGrounding(
  query: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ summary: string; rawItems: Array<{ title?: unknown; snippet?: unknown; url?: unknown }>; flagged: boolean }> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `لخّص نتائج البحث المباشر باللغة العربية باختصار ودقة للاستعلام التالي:\n${query}` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
    }
  )
  if (!response.ok) throw new Error(`live_search_http_${response.status}`)

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
      }
    }>
  }

  const candidate = payload.candidates?.[0]
  const rawSummary = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('\n').trim()
  const summaryCheck = stripInjection(cleanText(rawSummary, 1400))
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
  const rawItems = chunks
    .map((chunk) => ({
      title: chunk.web?.title ?? '',
      snippet: '',
      url: chunk.web?.uri ?? '',
    }))
    .filter((item) => item.url)

  return { summary: summaryCheck.text, rawItems, flagged: summaryCheck.flagged }
}

async function searchWithDuckDuckGo(
  query: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ summary: string; rawItems: Array<{ title?: unknown; snippet?: unknown; url?: unknown }>; flagged: boolean }> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`live_search_http_${response.status}`)

  const data = (await response.json()) as {
    Heading?: string
    AbstractText?: string
    AbstractURL?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>
  }

  const rawItems: Array<{ title?: unknown; snippet?: unknown; url?: unknown }> = []
  if (data.AbstractText && data.AbstractURL) {
    rawItems.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL })
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (topic.FirstURL && topic.Text) {
      rawItems.push({ title: topic.Text.slice(0, 80), snippet: topic.Text, url: topic.FirstURL })
    }
    for (const nested of topic.Topics ?? []) {
      if (nested.FirstURL && nested.Text) {
        rawItems.push({ title: nested.Text.slice(0, 80), snippet: nested.Text, url: nested.FirstURL })
      }
    }
  }

  const summaryCheck = stripInjection(cleanText(data.AbstractText ?? '', 1000))
  return { summary: summaryCheck.text, rawItems, flagged: summaryCheck.flagged }
}

/**
 * Executes a live web search with strict timeout, result sanitization, prompt-injection stripping,
 * and explicit user-facing error responses (never silent failures).
 */
export async function runLiveWebSearch(query: string, deps: LiveSearchDeps = {}): Promise<LiveSearchResult> {
  const cleanQuery = cleanText(query, MAX_QUERY_CHARS)
  if (cleanQuery.length < 2) {
    return {
      ok: false,
      code: 'invalid_query',
      messageAr: 'اكتب عبارة بحث واضحة لا تقل عن حرفين.',
    }
  }

  const timeoutMs = Math.min(Math.max(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, 200), 15_000)
  const fetchImpl = deps.fetchImpl ?? fetch
  const env = deps.env ?? process.env
  const apiKey = (env.GEMINI_API_KEY ?? '').trim()
  const model = (env.GEMINI_SEARCH_MODEL ?? env.GEMINI_MODEL ?? 'gemini-2.5-flash').trim()

  try {
    const useGemini = Boolean(apiKey) && !deps.preferDuckDuckGo
    const raw = useGemini
      ? await searchWithGeminiGrounding(cleanQuery, apiKey, model, timeoutMs, fetchImpl)
      : await searchWithDuckDuckGo(cleanQuery, timeoutMs, fetchImpl)

    const sanitized = sanitizeSearchItems(raw.rawItems)
    const flagged = raw.flagged || sanitized.flagged
    const summary =
      raw.summary ||
      (sanitized.items.length
        ? sanitized.items.map((item) => `• ${item.title}${item.snippet ? `: ${item.snippet}` : ''}`).join('\n')
        : 'لم أجد نتائج مباشرة مطابقة لهذا الاستعلام.')

    const contextLines = [
      summary,
      ...sanitized.items.map((item, idx) => `${idx + 1}. ${item.title} (${item.url})${item.snippet ? ` — ${item.snippet}` : ''}`),
    ].filter(Boolean)

    return {
      ok: true,
      query: cleanQuery,
      summary,
      results: sanitized.items,
      flagged,
      source: useGemini ? 'gemini_grounding' : 'duckduckgo',
      untrustedContext: wrapUntrusted('live_web_search', contextLines.join('\n')),
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 120) : 'unknown'
    if (isTimeoutError(error)) {
      console.error('live_search_timeout', { timeoutMs, reason })
      return {
        ok: false,
        code: 'search_timeout',
        messageAr: 'انتهت المهلة الزمنية للبحث الحي قبل وصول النتائج. أعد المحاولة بعد قليل.',
      }
    }
    console.error('live_search_failed', { reason })
    return {
      ok: false,
      code: 'search_unavailable',
      messageAr: 'تعذّر الاتصال بخدمة البحث الحي الآن. حاول مرة أخرى بعد قليل.',
    }
  }
}
