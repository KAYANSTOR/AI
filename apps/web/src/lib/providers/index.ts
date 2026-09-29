import { geminiProvider } from './gemini'
import { anthropicProvider } from './anthropic'
import { openaiProvider } from './openai'
import { AIProvider } from './types'

export * from './types'

export function getProvider(name: string): AIProvider {
  switch (name.toLowerCase()) {
    case 'gemini':
      return geminiProvider
    case 'anthropic':
      return anthropicProvider
    case 'openai':
      return openaiProvider
    default:
      // Fallback to Gemini if unknown or not specified
      return geminiProvider
  }
}
