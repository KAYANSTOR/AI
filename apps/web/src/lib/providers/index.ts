import { geminiProvider } from './gemini'
import { AIProvider } from './types'

export * from './types'

export function getProvider(): AIProvider {
  return geminiProvider
}
