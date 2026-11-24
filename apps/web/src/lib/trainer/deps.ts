import type { DbClient } from '@/lib/db/client'
import type { CentralBotConfig } from '@/lib/central-bot/config'
import { downloadCentralMedia, sendCentralButtons, sendCentralText } from '@/lib/central-bot/meta-client'
import { transcribeAudioWithGemini } from '@/lib/central-bot/transcribe'
import { assertWithinLimit, recordMeterUsage } from '@/lib/billing/entitlements'
import { embedKnowledgeText } from '@/lib/knowledge/embeddings'
import type { GenerateFn } from './extract'
import { readDocumentText } from './media'
import type { TrainerDeps } from './router'

type FetchLike = typeof fetch

/** Gemini JSON-mode call (text + optional inline image). Returns undefined without GEMINI_API_KEY. */
export function geminiGenerate(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): GenerateFn | undefined {
  const apiKey = (env.GEMINI_API_KEY ?? '').trim()
  if (!apiKey) return undefined
  const model = env.GEMINI_TRAINER_MODEL ?? env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite-preview'
  return async ({ system, text, image }) => {
    const parts: Record<string, unknown>[] = [{ text }]
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.bytes.toString('base64') } })
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 },
        }),
      }
    )
    if (!response.ok) throw new Error(`trainer_generate_http_${response.status}`)
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  }
}

/** Production wiring for «مدرب كيان» on a given WhatsApp number (central or dedicated). */
export function buildTrainerDeps(_db: DbClient, config: CentralBotConfig): TrainerDeps {
  return {
    sendText: (to, text) => sendCentralText(config, to, text),
    sendButtons: (to, text, buttons) => sendCentralButtons(config, to, text, buttons),
    downloadMedia: (mediaId) => downloadCentralMedia(config, mediaId),
    transcribe: (media) => transcribeAudioWithGemini(media),
    readDocument: (media) => readDocumentText(media),
    generate: geminiGenerate(),
    assertLimit: (client, organizationId) => assertWithinLimit(client, organizationId, 'ai_messages'),
    recordUsage: (client, organizationId) => recordMeterUsage(client, organizationId, 'ai_messages', 1),
    embed: (text, title) => embedKnowledgeText(text, 'document', title),
  }
}
