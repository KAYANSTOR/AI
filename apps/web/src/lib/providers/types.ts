export type AIProviderName = 'gemini' | 'groq'

export type ModelBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; name: string; content: string }

export type ModelMessage = {
  role: 'user' | 'assistant'
  content: string | Record<string, unknown>[]
  /** Exact provider-native payload when a provider requires it for the next turn. */
  providerPayload?: unknown
}

export type ModelToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type ModelResult = {
  content: ModelBlock[]
  inputTokens: number
  outputTokens: number
  providerPayload?: unknown
  model?: string
}

export class AIProviderError extends Error {
  readonly provider: AIProviderName
  readonly status: number | null
  readonly retryable: boolean
  readonly model: string

  constructor(
    message: string,
    options: {
      provider: AIProviderName
      status: number | null
      retryable: boolean
      model: string
    }
  ) {
    super(message)
    this.name = 'AIProviderError'
    this.provider = options.provider
    this.status = options.status
    this.retryable = options.retryable
    this.model = options.model
  }
}

export interface AIProvider {
  call(input: {
    system: string
    messages: ModelMessage[]
    tools: ModelToolDefinition[]
  }): Promise<ModelResult>
}
