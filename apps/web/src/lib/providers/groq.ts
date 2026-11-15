import type { AIProvider, ModelBlock, ModelMessage } from './types'
import { AIProviderError as ProviderError } from './types'

type GroqMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

type GroqResponse = {
  model?: string
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b'

function toGroqMessages(system: string, source: ModelMessage[]): GroqMessage[] {
  const messages: GroqMessage[] = [{ role: 'system', content: system }]

  for (const message of source) {
    if (typeof message.content === 'string') {
      messages.push({ role: message.role, content: message.content })
      continue
    }

    const blocks = message.content as ModelBlock[]
    const text = blocks
      .filter((block): block is Extract<ModelBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .filter(Boolean)
      .join('\n')

    const toolCalls = blocks
      .filter((block): block is Extract<ModelBlock, { type: 'tool_use' }> => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        type: 'function' as const,
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      }))

    const toolResults = blocks.filter(
      (block): block is Extract<ModelBlock, { type: 'tool_result' }> => block.type === 'tool_result'
    )

    if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls,
      })
    } else if (text) {
      messages.push({ role: message.role, content: text })
    }

    for (const result of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: result.tool_use_id,
        name: result.name,
        content: result.content,
      })
    }
  }

  return messages
}

function retryableStatus(status: number, message: string): boolean {
  if ([401, 403, 404, 408, 409, 425, 429].includes(status) || status >= 500) return true
  return status === 400 && /(api.?key|quota|resource_exhausted|rate.?limit|billing)/i.test(message)
}

function parseToolArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const groqProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.GROQ_API_KEY?.trim()
    const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL
    if (!apiKey) {
      throw new ProviderError('GROQ_API_KEY is required', {
        provider: 'groq',
        status: null,
        retryable: false,
        model,
      })
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: toGroqMessages(input.system, input.messages),
      max_completion_tokens: 1024,
      parallel_tool_calls: false,
    }

    if (input.tools.length) {
      requestBody.tools = input.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }))
      requestBody.tool_choice = 'auto'
    }

    let response: Response
    let payload: GroqResponse
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15_000),
      })
      payload = (await response.json()) as GroqResponse
    } catch (error) {
      throw new ProviderError(
        'Groq network error using ' + model + ': ' +
          (error instanceof Error ? error.message : String(error)),
        { provider: 'groq', status: null, retryable: true, model }
      )
    }

    if (!response.ok) {
      const reason = payload.error?.message || response.statusText || 'request_failed'
      throw new ProviderError(
        'Groq API error (' + response.status + ') using ' + model + ': ' + reason,
        {
          provider: 'groq',
          status: response.status,
          retryable: retryableStatus(response.status, reason),
          model,
        }
      )
    }

    const assistant = payload.choices?.[0]?.message
    if (!assistant) {
      throw new ProviderError('Groq returned an empty response using ' + model, {
        provider: 'groq',
        status: null,
        retryable: true,
        model,
      })
    }

    const content: ModelBlock[] = []
    if (typeof assistant.content === 'string' && assistant.content.trim()) {
      content.push({ type: 'text', text: assistant.content })
    }

    for (const call of assistant.tool_calls ?? []) {
      const name = call.function?.name
      if (!name) continue
      content.push({
        type: 'tool_use',
        id: call.id || 'call_' + crypto.randomUUID(),
        name,
        input: parseToolArguments(call.function?.arguments),
      })
    }

    if (!content.length) {
      throw new ProviderError('Groq returned no text or tool calls using ' + model, {
        provider: 'groq',
        status: null,
        retryable: true,
        model,
      })
    }

    return {
      content,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      model: payload.model || model,
    }
  },
}
