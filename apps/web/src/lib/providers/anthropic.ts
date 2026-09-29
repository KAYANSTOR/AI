import type { AIProvider, ModelBlock } from './types'

export const anthropicProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const model = process.env.ANTHROPIC_MODEL
    if (!apiKey || !model) throw new Error('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.2,
        system: input.system,
        messages: input.messages,
        tools: input.tools,
      }),
    })

    const payload = (await response.json()) as {
      content?: ModelBlock[]
      usage?: { input_tokens?: number; output_tokens?: number }
      error?: { message?: string }
    }

    if (!response.ok) {
      throw new Error(payload.error?.message ?? 'Model request failed: HTTP ' + response.status)
    }

    return {
      content: payload.content ?? [],
      inputTokens: Number(payload.usage?.input_tokens ?? 0),
      outputTokens: Number(payload.usage?.output_tokens ?? 0),
    }
  }
}
