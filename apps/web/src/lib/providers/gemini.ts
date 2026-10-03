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

    const candidateModels = Array.from(
      new Set([process.env.GEMINI_MODEL || 'gemini-3-flash-preview', 'gemini-3-flash-preview', 'gemini-3.8-flash'])
    )

    let response: Response | null = null
    let data: GeminiResponse | null = null
    let lastError: string | null = null

    for (const model of candidateModels) {
      try {
        const res = await fetch(
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
                temperature: 0.3,
              },
            }),
          }
        )

        const json = (await res.json()) as GeminiResponse
        if (res.ok) {
          response = res
          data = json
          break
        } else {
          lastError = json.error?.message || res.statusText
          // If rate limited or service unavailable, try next candidate model
          if (res.status === 429 || res.status === 503) {
            continue
          }
          throw new Error(`Gemini API error (${res.status}) using ${model}: ${lastError}`)
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }

    if (!response || !data) {
      throw new Error(`Gemini API error: ${lastError ?? 'All candidate models failed'}`)
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
