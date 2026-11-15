import { afterEach, describe, expect, test } from 'bun:test'
import { getAuthRedirectUrl, getPublicSiteOrigin } from '@/lib/auth/redirect-url'

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalRailwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  process.env.RAILWAY_PUBLIC_DOMAIN = originalRailwayDomain
})

describe('authentication redirect URL', () => {
  test('prefers the canonical production site URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://frontdesk.example.com/'
    process.env.NEXT_PUBLIC_APP_URL = 'https://legacy.example.com'
    process.env.RAILWAY_PUBLIC_DOMAIN = 'preview.example.com'

    expect(getPublicSiteOrigin()).toBe('https://frontdesk.example.com')
    expect(getAuthRedirectUrl('/auth/callback?next=%2Fonboarding')).toBe(
      'https://frontdesk.example.com/auth/callback?next=%2Fonboarding'
    )
  })

  test('uses the app URL compatibility alias when the site URL is absent', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://frontdesk.example.com/'

    expect(getPublicSiteOrigin()).toBe('https://frontdesk.example.com')
  })

  test('uses Vercel URL for preview when no canonical site URL is configured', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.RAILWAY_PUBLIC_DOMAIN = 'frontdesk-production.up.railway.app'

    expect(getPublicSiteOrigin()).toBe('https://frontdesk-production.up.railway.app')
  })

  test('does not silently fall back to localhost outside local development', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.RAILWAY_PUBLIC_DOMAIN

    expect(() => getPublicSiteOrigin()).toThrow(
      'Authentication redirect origin is not configured'
    )
  })
})
