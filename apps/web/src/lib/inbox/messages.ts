import type { DbClient } from '@/lib/db/client'

export const CONVERSATION_PAGE_SIZE = 50
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/

export type ThreadMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  messageType: string
  senderType: string | null
  createdAt: string
  media: Record<string, unknown> | null
}

export type ThreadPage = {
  messages: ThreadMessage[]
  /** Cursor for the next "load older" request, or null when the start is reached. */
  olderCursor: string | null
}

/** Opaque cursor: `<created_at ISO>|<id>` of the oldest message already shown. */
export function encodeMessageCursor(message: Pick<ThreadMessage, 'createdAt' | 'id'>) {
  return message.createdAt + '|' + message.id
}

export function decodeMessageCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null
  const [createdAt, id] = cursor.split('|')
  if (!createdAt || !id || !Number.isFinite(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) return null
  // Keep the raw timestamp (microsecond precision) so keyset paging never skips rows.
  if (!TIMESTAMP_PATTERN.test(createdAt)) return null
  return { createdAt, id }
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  const raw = String(value ?? '')
  if (TIMESTAMP_PATTERN.test(raw)) return raw
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString()
}

export const THREAD_MESSAGE_COLUMNS = 'id, direction, content, message_type, sender_type, created_at, media'

export function toThreadMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: String(row.id),
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    content: typeof row.content === 'string' ? row.content : '',
    messageType: typeof row.message_type === 'string' ? row.message_type : 'text',
    senderType: typeof row.sender_type === 'string' ? row.sender_type : null,
    createdAt: toIso(row.created_at),
    media: row.media && typeof row.media === 'object' && !Array.isArray(row.media) ? row.media as Record<string, unknown> : null,
  }
}

/**
 * Newest messages first (keyset pagination), returned in chronological order
 * for rendering. A long conversation therefore always opens on its latest
 * messages instead of the oldest 200.
 */
export async function loadConversationMessages(
  db: DbClient,
  input: { organizationId: string; conversationId: string; cursor?: string | null; pageSize?: number }
): Promise<ThreadPage> {
  const pageSize = Math.min(Math.max(input.pageSize ?? CONVERSATION_PAGE_SIZE, 1), 100)
  const cursor = decodeMessageCursor(input.cursor)
  let query = db
    .from('messages')
    .select(THREAD_MESSAGE_COLUMNS)
    .eq('conversation_id', input.conversationId)
    .eq('organization_id', input.organizationId)
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = rows.length > pageSize
  const page = rows.slice(0, pageSize).map(toThreadMessage)
  const oldest = page[page.length - 1]
  return {
    messages: page.reverse(),
    olderCursor: hasMore && oldest ? encodeMessageCursor(oldest) : null,
  }
}
