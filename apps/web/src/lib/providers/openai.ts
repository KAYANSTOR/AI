import type { AIProvider, ModelBlock } from './types'

export const openaiProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    if (!apiKey) throw new Error('OPENAI_API_KEY is required')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: input.system },
          ...input.messages.map(msg => {
            // Transform messages if needed to match OpenAI's format
            return {
              role: msg.role,
              content: msg.content
            }
          })
        ],
        tools: input.tools?.length ? input.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
          }
        })) : undefined
      }),
    })

    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.error?.message ?? 'Model request failed: HTTP ' + response.status)
    }

    const message = payload.choices[0]?.message
    const content: ModelBlock[] = []
    
    if (message?.content) {
      content.push({ type: 'text', text: message.content })
    }
    
    if (message?.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.type === 'function') {
          content.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments || '{}')
          })
        }
      }
    }

    return {
      content,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    }
  }
}
