/**
 * HTTP security headers (F4), applied to every route by next.config.ts.
 *
 * The CSP ships as Report-Only first: it documents the intended policy (Next.js runtime,
 * Meta Embedded Signup / Facebook SDK, Gemini/Vapi voice) without blocking anything that
 * works today. Promote it to `Content-Security-Policy` once reports are clean.
 */

const META_SOURCES = ['https://connect.facebook.net', 'https://*.facebook.com', 'https://*.facebook.net', 'https://graph.facebook.com', 'https://*.fbcdn.net']
const VOICE_SOURCES = ['https://*.vapi.ai', 'wss://*.vapi.ai', 'https://*.daily.co', 'wss://*.daily.co']

export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://*.facebook.com",
  // Next.js App Router injects inline bootstrap scripts; the Facebook SDK loads remotely.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${META_SOURCES.join(' ')} https://*.vapi.ai`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${META_SOURCES.join(' ')} ${VOICE_SOURCES.join(' ')}`,
  `frame-src 'self' ${META_SOURCES.join(' ')} https://*.daily.co`,
  "media-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

export const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=(self)',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'browsing-topics=()',
].join(', ')

export type SecurityHeader = { key: string; value: string }

export const SECURITY_HEADERS: SecurityHeader[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY_REPORT_ONLY },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

export async function securityHeaders() {
  return [{ source: '/:path*', headers: SECURITY_HEADERS }]
}
