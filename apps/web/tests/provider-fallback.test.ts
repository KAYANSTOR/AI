import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { callProvider } from '@/lib/providers'

const originalGeminiKey = process.env.GEMINI_API_KEY
const originalGeminiModel = process.env.GEMINI_MODEL
const originalGroqKey = process.env.GROQ_API_KEY
const originalGroqModel = process.env.GROQ_MODEL
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.GEMINI_MODEL = 'gemini-3.8-flash'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.GROQ_MODEL = 'openai/gpt-oss-120b'
})

afterEach(() => {
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalGeminiKey
  if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL
  else process.env.GEMINI_MODEL = originalGeminiModel
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalGroqKey
  if (originalGroqModel === undefined) delete process.env.GROQ_MODEL
  else process.env.GROQ_MODEL = originalGroqModel
  globalThis.fetch = originalFetch
})

describe('AI provider failover', () => {
  test('switches from Gemini to Groq on a quota response', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED quota exceeded' } }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content: 'تم استلام رسالتك.' } }],
        usage: { prompt_tokens: 4, completion_tokens: 6 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callProvider({
      system: 'system',
      messages: [{ role: 'user', content: 'مرحبا' }],
      tools: [],
    })

    expect(result.provider).toBe('groq')
    expect(result.result.content).toEqual([{ type: 'text', text: 'تم استلام رسالتك.' }])
    expect(calls.length).toBe(2)
    expect(calls[0]).toContain('generativelanguage.googleapis.com')
    expect(calls[1]).toContain('api.groq.com')
  })

  test('does not hide a non-retryable malformed Gemini request', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(
        JSON.stringify({ error: { message: 'Invalid request body shape' } }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    }) as typeof fetch

    await expect(callProvider({
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })).rejects.toThrow('Invalid request body shape')

    expect(calls).toBe(1)
  })

  test('uses Groq when the primary Gemini credential is not configured', async () => {
    delete process.env.GEMINI_API_KEY
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response(JSON.stringify({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content: 'أنا هنا.' } }],
        usage: { prompt_tokens: 2, completion_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callProvider({
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })

    expect(called).toBe(true)
    expect(result.provider).toBe('groq')
  })
})
