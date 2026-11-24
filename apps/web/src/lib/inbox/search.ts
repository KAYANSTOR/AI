import type { DbClient } from '@/lib/db/client'

export const INBOX_PAGE_SIZE = 30
const SEARCH_MATCH_LIMIT = 500

/** Escape LIKE wildcards so user input is matched literally. */
export function likePattern(q: string) {
  return '%' + q.replace(/[\\%_]/g, (char) => '\\' + char) + '%'
}

export function parseInboxPage(value: string | undefined) {
  const page = Number.parseInt(String(value ?? '1'), 10)
  return Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1
}

/**
 * Database-side inbox search across every conversation of the organization:
 * contact name, phone and message content. Returns the matching conversation
 * filter, or null when the query matches nothing.
 */
export async function inboxSearchFilter(db: DbClient, organizationId: string, rawQuery: string): Promise<string | null> {
  const q = rawQuery.trim().slice(0, 120)
  if (!q) return ''
  const pattern = likePattern(q)
  const digits = q.replace(/\D/g, '')
  const [byName, byPhone, byMessage] = await Promise.all([
    db.from('contacts').select('id').eq('organization_id', organizationId).ilike('full_name', pattern).limit(SEARCH_MATCH_LIMIT),
    digits.length >= 3
      ? db.from('contacts').select('id').eq('organization_id', organizationId).ilike('phone', likePattern(digits)).limit(SEARCH_MATCH_LIMIT)
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    db.from('messages').select('conversation_id').eq('organization_id', organizationId).ilike('content', pattern)
      .order('created_at', { ascending: false }).limit(SEARCH_MATCH_LIMIT),
  ])
  const firstError = byName.error || byPhone.error || byMessage.error
  if (firstError) throw new Error(firstError.message)
  const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
  const contactIds = [...new Set([...(byName.data ?? []), ...(byPhone.data ?? [])].map((row) => row.id).filter(isUuid))]
  const conversationIds = [...new Set((byMessage.data ?? []).map((row) => (row as { conversation_id?: unknown }).conversation_id).filter(isUuid))]
  const parts: string[] = []
  if (contactIds.length) parts.push(`contact_id.in.(${contactIds.join(',')})`)
  if (conversationIds.length) parts.push(`id.in.(${conversationIds.join(',')})`)
  return parts.length ? parts.join(',') : null
}
