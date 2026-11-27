import { describe, expect, test } from 'bun:test'
import { readProductionHealth } from '../src/lib/runtime/production-health'

const healthy = async (url: string, init: RequestInit) => {
  expect(url).toBe('http://127.0.0.1:3001/health')
  expect(init.signal).toBeInstanceOf(AbortSignal)
  expect(init.redirect).toBe('error')
  return Response.json({ ok: true, service: 'whatsapp-gateway' })
}

describe('production health', () => {
  test('optional central bot never blocks healthy core services', async () => {
    const health = await readProductionHealth({ NODE_ENV: 'test' }, healthy)
    expect(health.ok).toBe(true)
    expect(health.central.status).toBe('unconfigured')
    expect(health.central.message).toContain('غير مهيأ')
  })
  test('reports configuration only and never returns credentials', async () => {
    const health = await readProductionHealth({
      NODE_ENV: 'test',
      KAYAN_CENTRAL_WA_PHONE_NUMBER_ID: 'test-id',
      KAYAN_CENTRAL_WA_ACCESS_TOKEN: 'synthetic-token',
      KAYAN_CENTRAL_WA_DISPLAY_NUMBER: '+12025550100',
    }, healthy)
    expect(health.central.status).toBe('configured')
    expect(JSON.stringify(health)).not.toContain('synthetic-token')
    expect(JSON.stringify(health)).not.toContain('12025550100')
  })
  test('unhealthy dependency is not reported as ready', async () => {
    for (const reply of [async () => new Response(null, { status: 503 }), async () => Response.json({ ok: true }), async () => { throw new Error('synthetic upstream failure') }]) {
      const health = await readProductionHealth({ NODE_ENV: 'test' }, reply)
      expect(health.ok).toBe(false)
      expect(health.message).toContain('غير متاحة')
      expect(JSON.stringify(health)).not.toContain('synthetic upstream failure')
    }
  })
  test('invalid gateway port does not trigger a fetch', async () => {
    const health = await readProductionHealth({ NODE_ENV: 'test', WHATSAPP_GATEWAY_PORT: 'invalid' }, async () => { throw new Error('unexpected call') })
    expect(health.ok).toBe(false)
  })
})
