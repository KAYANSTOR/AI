import { geminiProvider } from './gemini'
import { groqProvider } from './groq'
import type { AIProvider, AIProviderName, ModelMessage, ModelToolDefinition, ModelResult } from './types'
import { AIProviderError } from './types'

export * from './types'

export type ProviderCallResult = {
  provider: AIProviderName
  result: ModelResult
}

/** Kept for existing callers that explicitly require the primary provider. */
export function getProvider(): AIProvider {
  return geminiProvider
}

/**
 * Use Gemini first, then switch once to Groq for quota, availability, timeout,
 * authentication/configuration and server-side provider failures.
 * The caller keeps the selected provider for the rest of the agent turn.
 */
export async function callProvider(
  input: { system: string; messages: ModelMessage[]; tools: ModelToolDefinition[] },
  preferredProvider: AIProviderName = 'gemini'
): Promise<ProviderCallResult> {
  if (preferredProvider === 'groq') {
    return { provider: 'groq', result: await groqProvider.call(input) }
  }

  try {
    return { provider: 'gemini', result: await geminiProvider.call(input) }
  } catch (error) {
    const canFallback =
      error instanceof AIProviderError &&
      error.retryable &&
      Boolean(process.env.GROQ_API_KEY?.trim())

    if (!canFallback) throw error

    console.warn('Primary AI provider failed; switching to fallback', {
      from: 'gemini',
      to: 'groq',
      status: error.status,
      reason: error.message.slice(0, 180),
    })

    return { provider: 'groq', result: await groqProvider.call(input) }
  }
}
