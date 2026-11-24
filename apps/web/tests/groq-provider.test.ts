import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { groqProvider } from '@/lib/providers/groq'
import { AIProviderError } from '@/lib/providers/types'

const originalKey = process.env.GROQ_API_KEY
const originalModel = process.env.GROQ_MODEL
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.GROQ_MODEL = 'openai/gpt-oss-120b'
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalKey

  if (originalModel === undefined) delete process.env.GROQ_MODEL
  else process.env.GROQ_MODEL = originalModel

  globalThis.fetch = originalFetch
})

describe('Groq provider contract', () => {
  test('uses the OpenAI-compatible endpoint and maps tool calls and tool results', async () => {
    let requestUrl = ''
    let request: RequestInit | undefined

    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input)
      request = init
      return new Response(JSON.stringify({
        model: 'openai/gpt-oss-120b',
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_next',
              type: 'function',
              function: { name: 'lookup', arguments: '{"id":"customer-1"}' },
            }],
          },
        }],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await groqProvider.call({
      system: 'أنت وكيل خدمة عملاء.',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'lookup', input: { q: 'x' } }],
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'call_1',
            name: 'lookup',
            content: JSON.stringify({ ok: true }),
          }],
        },
      ],
      tools: [{
        name: 'lookup',
        description: 'Find a customer.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } } },
      }],
    })

    expect(requestUrl).toBe('https://api.groq.com/openai/v1/chat/completions')
    const headers = new Headers(request?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-groq-key')

    const body = JSON.parse(String(request?.body))
    expect(body.model).toBe('openai/gpt-oss-120b')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'أنت وكيل خدمة عملاء.' })
    expect(body.messages[1].tool_calls[0].id).toBe('call_1')
    expect(body.messages[2].role).toBe('tool')
    expect(body.messages[2].tool_call_id).toBe('call_1')
    expect(body.messages[2].name).toBe('lookup')
    expect(body.tools[0].function.name).toBe('lookup')

    expect(result.model).toBe('openai/gpt-oss-120b')
    expect(result.content).toEqual([{
      type: 'tool_use',
      id: 'call_next',
      name: 'lookup',
      input: { id: 'customer-1' },
    }])
    expect(result.inputTokens).toBe(12)
    expect(result.outputTokens).toBe(5)
  })

  test('surfaces rate-limit errors as retryable provider failures', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: { message: 'Rate limit reached' } }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch

    try {
      await groqProvider.call({
        system: 'system',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
      })
      throw new Error('expected Groq to reject a rate-limited request')
    } catch (error) {
      expect(error).toBeInstanceOf(AIProviderError)
      if (!(error instanceof AIProviderError)) throw error
      expect(error.provider).toBe('groq')
      expect(error.status).toBe(429)
      expect(error.retryable).toBe(true)
    }
  })

  test('falls back to a text-only request when the tool-enabled response is empty', async () => {
    const bodies: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ model: 'openai/gpt-oss-120b', choices: [{ message: { content: null, tool_calls: [] } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content: 'إليك الإجابة النصية.' } }],
        usage: { prompt_tokens: 20, completion_tokens: 6 },
      }), { status: 200 })
    }) as typeof fetch

    const result = await groqProvider.call({
      system: 'تعليمات الوكيل وقاعدة المعرفة',
      messages: [{ role: 'user', content: 'ما الحالة؟' }],
      tools: [{ name: 'lookup', description: 'lookup', input_schema: { type: 'object' } }],
    })

    expect(bodies).toHaveLength(2)
    expect(bodies[0].tools).toBeDefined()
    expect(bodies[1].tools).toBeUndefined()
    expect((bodies[1].messages as Array<Record<string, unknown>>)[0]).toEqual({ role: 'system', content: 'تعليمات الوكيل وقاعدة المعرفة' })
    expect(result.content).toEqual([{ type: 'text', text: 'إليك الإجابة النصية.' }])
    expect(result.attempts).toBe(2)
  })
})
