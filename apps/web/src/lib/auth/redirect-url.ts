const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function normalizeSiteOrigin(value: string): string {
  const trimmed = value.trim()
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Auth redirect URL must use http or https.')
  }

  if (url.username || url.password) {
    throw new Error('Auth redirect URL must not contain credentials.')
  }

  return url.origin
}

/**
 * Returns the canonical browser origin used by authentication redirects.
 *
 * Production must provide NEXT_PUBLIC_SITE_URL (or the existing compatibility
 * alias NEXT_PUBLIC_APP_URL). NEXT_PUBLIC_VERCEL_URL is accepted as a safe
 * fallback for preview deployments. localhost is only accepted locally.
 */
export function getPublicSiteOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configured) {
    return normalizeSiteOrigin(configured)
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (vercelUrl) {
    return normalizeSiteOrigin(vercelUrl)
  }

  if (typeof window !== 'undefined' && LOCAL_HOSTS.has(window.location.hostname)) {
    return window.location.origin
  }

  throw new Error(
    'Authentication redirect origin is not configured. Set NEXT_PUBLIC_SITE_URL in the deployment environment.'
  )
}

export function getAuthRedirectUrl(pathname: string): string {
  return new URL(pathname, getPublicSiteOrigin()).toString()
}
