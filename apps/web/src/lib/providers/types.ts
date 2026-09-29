export type ModelBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; name: string; content: string }

export type ModelMessage = { role: 'user' | 'assistant'; content: string | Record<string, unknown>[] }

export type ModelToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type ModelResult = {
  content: ModelBlock[]
  inputTokens: number
  outputTokens: number
}

export interface AIProvider {
  call(input: {
    system: string
    messages: ModelMessage[]
    tools: ModelToolDefinition[]
  }): Promise<ModelResult>
}
