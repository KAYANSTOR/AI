export const CONTACTS_DEFAULT_LIMIT = 50
export const CONTACTS_MAX_LIMIT = 100
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/

export function parseContactsLimit(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return CONTACTS_DEFAULT_LIMIT
  return Math.min(CONTACTS_MAX_LIMIT, parsed)
}

/** Opaque base64url cursor of `<created_at ISO>|<id>`. */
export function encodeContactsCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(`${row.created_at}|${row.id}`, 'utf8').toString('base64url')
}

export function decodeContactsCursor(value: string | null): { createdAt: string; id: string } | null {
  if (!value) return null
  let decoded: string
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const [createdAt, id, extra] = decoded.split('|')
  if (extra !== undefined || !createdAt || !id) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  if (!TIMESTAMP_PATTERN.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) return null
  return { createdAt, id }
}
