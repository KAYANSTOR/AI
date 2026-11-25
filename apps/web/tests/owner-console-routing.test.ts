import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'
import nextConfig from '../next.config'

test('routes the owner console paths to the standalone host when configured', async () => {
  const previous = process.env.OWNER_CONSOLE_URL
  process.env.OWNER_CONSOLE_URL = 'https://owner-console.example.test/'
  try {
    const routes = await nextConfig.rewrites?.()
    assert.ok(Array.isArray(routes))
    const destinations = new Map(routes.map(route => [route.source, route.destination]))
    expect(destinations.get('/admin/:path*')).toBe('https://owner-console.example.test/admin/:path*')
    expect(destinations.get('/api/owner/:path*')).toBe('https://owner-console.example.test/api/owner/:path*')
    expect(destinations.get('/api/owner-console/health')).toBe('https://owner-console.example.test/api/health')
  } finally {
    if (previous === undefined) delete process.env.OWNER_CONSOLE_URL
    else process.env.OWNER_CONSOLE_URL = previous
  }
})
