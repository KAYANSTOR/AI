import { timingSafeEqual } from 'node:crypto'

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret || secret.length < 32 || !authorizationHeader) return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorizationHeader)
  if (actual.length !== expected.length) return false

  return timingSafeEqual(actual, expected)
}
