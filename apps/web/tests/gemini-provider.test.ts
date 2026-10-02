import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { geminiProvider } from '@/lib/providers/gemini'

const originalKey = process.env.GEMINI_API_KEY
const originalModel = process.env.GEMINI_MODEL
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.GEMINI_MODEL = 'gemini-3.8-flash'
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalKey

  if (originalModel === undefined) delete process.env.GEMINI_MODEL
  else process.env.GEMINI_MODEL = originalModel

  globalThis.fetch = originalFetch
})

describe('Gemini 3.8 provider contract', () => {
  test('sends the supported API shape without deprecated temperature sampling', async () => {
    let request: RequestInit | undefined
    let url = ''

    globalThis.fetch = (async (input, init) => {
      url = String(input)
      request = init
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'تم' }] } }],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as typeof fetch

    const result = await geminiProvider.call({
      system: 'أنت وكيل خدمة عملاء.',
      messages: [{ role: 'user', content: 'السلام عليكم' }],
      tools: [],
    })

    expect(result.content).toEqual([{ type: 'text', text: 'تم' }])
    expect(url).toContain('/v1beta/models/gemini-3.8-flash:generateContent')
    const headers = new Headers(request?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('x-goog-api-key')).toBe('test-key')

    const body = JSON.parse(String(request?.body))
    expect(body.generationConfig).toEqual({ maxOutputTokens: 1024 })
    expect(body.generationConfig.temperature).toBeUndefined()
  })

  test('preserves function-call id when sending a tool result back to Gemini', async () => {
    let body: Record<string, unknown> | undefined

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'تم تنفيذ الأداة.' }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as typeof fetch

    await geminiProvider.call({
      system: 'system',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_123', name: 'lookup', input: { q: 'x' } }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_123',
              name: 'lookup',
              content: JSON.stringify({ ok: true }),
            },
          ],
        },
      ],
      tools: [],
    })

    const contents = body?.contents as Array<Record<string, unknown>>
    const userTurn = contents[1]
    const parts = userTurn.parts as Array<Record<string, unknown>>
    const functionResponse = parts[0].functionResponse as Record<string, unknown>

    expect(functionResponse.id).toBe('call_123')
    expect(functionResponse.name).toBe('lookup')
    expect(functionResponse.response).toEqual({ ok: true })
  })

  test('surfaces provider status and model in server-safe error text', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: 'API key not valid' } }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch

    await expect(
      geminiProvider.call({
        system: 'system',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
      })
    ).rejects.toThrow('Gemini API error (400) using gemini-3.8-flash: API key not valid')
  })
})
