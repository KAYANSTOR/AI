import { getPublicSiteOrigin } from './redirect-url'

/** Absolute link for e-mails and OAuth callbacks, from configuration — never the Host header. */
export function siteUrl(pathname: string): string {
  const configured = process.env.APP_URL?.trim()
  const origin = configured ? new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`).origin : getPublicSiteOrigin()
  return new URL(pathname, origin).toString()
}

export function isSiteUrlConfigured(): boolean {
  try { siteUrl('/'); return true } catch { return false }
}
