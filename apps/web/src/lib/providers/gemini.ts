import type { AIProvider, ModelBlock } from './types'

type GeminiPart = {
  text?: string
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: unknown }
}

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { message?: string }
}

export const geminiProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is required')

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

    const contents: GeminiContent[] = []
    for (const msg of input.messages) {
      if (msg.providerPayload && Array.isArray(msg.providerPayload)) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.providerPayload as GeminiPart[],
        })
      } else if (typeof msg.content === 'string') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })
      } else {
        const parts: GeminiPart[] = []
        for (const block of msg.content as ModelBlock[]) {
          if (block.type === 'text') {
            parts.push({ text: block.text })
          } else if (block.type === 'tool_use') {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input,
              },
            })
          } else if (block.type === 'tool_result') {
            let parsedContent
            try {
              parsedContent = JSON.parse(block.content)
            } catch {
              parsedContent = { result: block.content }
            }
            parts.push({
              functionResponse: {
                id: block.tool_use_id,
                name: block.name,
                response: parsedContent,
              },
            })
          }
        }
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts,
        })
      }
    }

    const tools =
      input.tools.length > 0
        ? [
            {
              functionDeclarations: input.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
              })),
            },
          ]
        : undefined

    const systemInstruction = input.system
      ? {
          parts: [{ text: input.system }],
        }
      : undefined

    const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction,
          contents,
          tools,
          generationConfig: {
            maxOutputTokens: 1024,
          },
        }),
      }
    )

    const data = (await response.json()) as GeminiResponse
    if (!response.ok) {
      const detail = data.error?.message ?? 'Gemini request failed'
      throw new Error(`Gemini API error (${response.status}) using ${model}: ${detail}`)
    }

    const firstCandidate = data.candidates?.[0]
    const contentParts = firstCandidate?.content?.parts ?? []

    const content: ModelBlock[] = contentParts.flatMap((p): ModelBlock[] => {
      if (p.text) {
        return [{ type: 'text', text: p.text }]
      } else if (p.functionCall) {
        return [
          {
            type: 'tool_use',
            id: p.functionCall.id || `call_${crypto.randomUUID()}`,
            name: p.functionCall.name,
            input: p.functionCall.args || {},
          },
        ]
      }
      return []
    })

    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      providerPayload: contentParts,
    }
  },
}
