import { timingSafeEqual } from 'node:crypto'

export function authorizeKayanAdminRequest(request: Request): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const expected = process.env.KAYAN_ADMIN_API_TOKEN?.trim() ?? ''
  if (expected.length < 32) return { ok: false, status: 503, error: 'admin_api_not_configured' }
  const authorization = request.headers.get('authorization') ?? ''
  const actual = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  const valid = actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
  return valid ? { ok: true } : { ok: false, status: 401, error: 'unauthorized' }
}
