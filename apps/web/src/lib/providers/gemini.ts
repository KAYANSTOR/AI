import { AIProvider, ModelResult, ModelMessage, ModelToolDefinition, ModelBlock } from './types'

export const geminiProvider: AIProvider = {
  async call(input) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is required')
    
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest'
    
    const contents: any[] = []
    for (const msg of input.messages) {
      if (typeof msg.content === 'string') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })
      } else {
        const parts: any[] = []
        for (const block of msg.content as ModelBlock[]) {
          if (block.type === 'text') {
            parts.push({ text: block.text })
          } else if (block.type === 'tool_use') {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input
              }
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
                name: block.name,
                response: parsedContent
              }
            })
          }
        }
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts
        })
      }
    }
    
    // Tools
    const tools = input.tools.length > 0 ? [{
      functionDeclarations: input.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema // Gemini accepts the same JSON schema
      }))
    }] : undefined

    const systemInstruction = input.system ? {
      parts: [{ text: input.system }]
    } : undefined

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction,
        contents,
        tools,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700
        }
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message ?? 'Gemini request failed: HTTP ' + response.status)
    }
    
    const firstCandidate = data.candidates?.[0]
    const contentParts = firstCandidate?.content?.parts ?? []
    
    const content: ModelBlock[] = contentParts.map((p: any) => {
      if (p.text) {
        return { type: 'text', text: p.text }
      } else if (p.functionCall) {
        return {
          type: 'tool_use',
          id: `call_${Math.random().toString(36).substring(7)}`,
          name: p.functionCall.name,
          input: p.functionCall.args || {}
        }
      }
      return null
    }).filter(Boolean)

    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0
    }
  }
}
