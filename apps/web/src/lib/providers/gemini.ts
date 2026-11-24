import type { AIProvider, ModelBlock } from './types'
import { AIProviderError } from './types'

type GeminiPart = { text?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; functionResponse?: { id?: string; name?: string; response: unknown } }
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }
type GeminiResponse = { candidates?: Array<{ content?: { parts?: GeminiPart[] } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; error?: { message?: string } }
function cleanGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(cleanGeminiSchema)
  const copy = { ...(schema as Record<string, unknown>) }
  delete copy.additionalProperties; delete copy['$schema']; delete copy.default
  if (copy.properties && typeof copy.properties === 'object') {
    const cleanProps: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(copy.properties as Record<string, unknown>)) cleanProps[key] = cleanGeminiSchema(value)
    copy.properties = cleanProps
  }
  if (copy.items) copy.items = cleanGeminiSchema(copy.items)
  return copy
}
function retryableStatus(status: number) { return status === 408 || status === 425 || status === 429 || status >= 500 }
function quotaExhausted(status: number, message: string) { return status === 429 && /(quota|resource_exhausted|billing)/i.test(message) }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }
export const geminiProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    const configuredModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite-preview'
    if (!apiKey) throw new AIProviderError('GEMINI_API_KEY is required', { provider: 'gemini', status: null, retryable: true, model: configuredModel })
    const contents: GeminiContent[] = []
    for (const message of input.messages) {
      if (message.providerPayload && Array.isArray(message.providerPayload)) contents.push({ role: message.role === 'user' ? 'user' : 'model', parts: message.providerPayload as GeminiPart[] })
      else if (typeof message.content === 'string') contents.push({ role: message.role === 'user' ? 'user' : 'model', parts: [{ text: message.content }] })
      else {
        const parts: GeminiPart[] = []
        for (const block of message.content as ModelBlock[]) {
          if (block.type === 'text') parts.push({ text: block.text })
          else if (block.type === 'tool_use') parts.push({ functionCall: { name: block.name, args: block.input } })
          else if (block.type === 'tool_result') {
            let parsedContent: unknown
            try { parsedContent = JSON.parse(block.content) } catch { parsedContent = { result: block.content } }
            parts.push({ functionResponse: { id: block.tool_use_id, name: block.name, response: parsedContent } })
          }
        }
        contents.push({ role: message.role === 'user' ? 'user' : 'model', parts })
      }
    }
    const tools = input.tools.length ? [{ functionDeclarations: input.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: cleanGeminiSchema(tool.input_schema) })) }] : undefined
    const systemInstruction = input.system ? { parts: [{ text: input.system }] } : undefined
    const candidateModels = Array.from(new Set([configuredModel, 'gemini-3.1-flash-lite-preview']))
    let lastError = 'All candidate models failed'; let lastStatus: number | null = null; let lastModel = configuredModel; let lastRetryable = true; let quotaFallback = false; let attempts = 0
    for (const model of candidateModels) {
      lastModel = model
      for (let retry = 0; retry < 3; retry += 1) {
        attempts += 1
        console.info('ai_provider_attempt', { provider: 'gemini', model, attempt: attempts })
        try {
          const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ systemInstruction, contents, tools, generationConfig: { maxOutputTokens: input.isWhatsApp ? 400 : 1024 } }), signal: AbortSignal.timeout(15_000),
          })
          const payload = (await response.json()) as GeminiResponse
          if (!response.ok) {
            lastError = payload.error?.message || response.statusText || 'request_failed'; lastStatus = response.status; lastRetryable = retryableStatus(response.status)
            if (quotaExhausted(response.status,lastError)) {
              // A hard quota exhaustion will not clear by retrying the same provider/model.
              // Keep the error fallback-eligible, but switch providers immediately.
              quotaFallback = true
              lastRetryable = true
              break
            }
            if (!lastRetryable) break
            await sleep(250 * (retry + 1)); continue
          }
          const contentParts = payload.candidates?.[0]?.content?.parts ?? []
          const content: ModelBlock[] = contentParts.flatMap((part): ModelBlock[] => part.text ? [{ type: 'text', text: part.text }] : part.functionCall ? [{ type: 'tool_use', id: part.functionCall.id || 'call_' + crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args || {} }] : [])
          if (!content.length) throw new AIProviderError('Gemini returned an empty response using ' + model, { provider: 'gemini', status: null, retryable: true, model })
          console.info('ai_provider_success', { provider: 'gemini', model, attempts })
          return { content, inputTokens: payload.usageMetadata?.promptTokenCount ?? 0, outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0, providerPayload: contentParts, model, attempts }
        } catch (error) {
          if (error instanceof AIProviderError) { lastError = error.message; lastStatus = error.status; lastRetryable = error.retryable }
          else { lastError = error instanceof Error ? error.message : String(error); lastStatus = null; lastRetryable = true }
          if (retry < 2 && lastRetryable) { await sleep(250 * (retry + 1)); continue }
        }
        if (!lastRetryable) break
      }
      if (quotaFallback || (!lastRetryable && lastStatus !== 404)) break
    }
    throw new AIProviderError('Gemini API error' + (lastStatus ? ' (' + lastStatus + ')' : '') + ' using ' + lastModel + ': ' + lastError, { provider: 'gemini', status: lastStatus, retryable: lastRetryable, model: lastModel })
  },
}
