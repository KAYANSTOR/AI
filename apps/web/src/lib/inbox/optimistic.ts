import type { ThreadMessage } from '@/lib/inbox/messages'

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed'

/** A thread row plus client-only delivery state for optimistic staff replies. */
export type InboxMessage = ThreadMessage & { clientId?: string; deliveryStatus?: DeliveryStatus }

export function appendOptimistic(messages: InboxMessage[], input: { clientId: string; content: string; createdAt: string }): InboxMessage[] {
  return [...messages, {
    id: `optimistic:${input.clientId}`,
    clientId: input.clientId,
    direction: 'outbound',
    content: input.content,
    messageType: 'text',
    senderType: 'human_dashboard',
    createdAt: input.createdAt,
    media: null,
    deliveryStatus: 'sending',
  }]
}

/**
 * Replace the optimistic bubble with the server-confirmed row. A queued reply has
 * no message row yet, so the bubble stays and keeps showing "sending".
 */
export function confirmOptimistic(
  messages: InboxMessage[],
  clientId: string,
  confirmed: ThreadMessage | null,
  delivery: 'sent' | 'queued' | 'blocked'
): InboxMessage[] {
  if (delivery === 'blocked') return failOptimistic(messages, clientId)
  return messages.flatMap((message) => {
    if (message.clientId !== clientId) return [message]
    if (!confirmed) return [{ ...message, deliveryStatus: 'sending' as const }]
    if (messages.some((other) => other.id === confirmed.id && other.clientId !== clientId)) return []
    return [{ ...confirmed, deliveryStatus: 'sent' as const }]
  })
}

export function failOptimistic(messages: InboxMessage[], clientId: string): InboxMessage[] {
  return messages.map((message) => (message.clientId === clientId ? { ...message, deliveryStatus: 'failed' as const } : message))
}

/**
 * Merge a server refresh: server rows are authoritative; a pending optimistic bubble
 * is dropped once a matching outbound staff row (same text) arrives.
 */
export function reconcileWithServer(current: InboxMessage[], server: ThreadMessage[]): InboxMessage[] {
  const serverIds = new Set(server.map((message) => message.id))
  const firstServerAt = server[0]?.createdAt ?? ''
  const older = current.filter((message) => !message.clientId && !serverIds.has(message.id) && message.createdAt < firstServerAt)
  const known = new Map(current.filter((message) => !message.clientId).map((message) => [message.id, message]))
  const merged: InboxMessage[] = server.map((message) => ({ ...message, deliveryStatus: known.get(message.id)?.deliveryStatus }))
  const claimed = new Set<string>()
  const pending = current.filter((message) => {
    if (!message.clientId) return false
    const match = server.find((row) => !claimed.has(row.id) && row.direction === 'outbound' && !known.has(row.id) && row.content.trim() === message.content.trim())
    if (match) { claimed.add(match.id); return false }
    return true
  })
  return [...older, ...merged, ...pending]
}

/**
 * Tick shown inside an outbound bubble. Client state wins (sending/failed/sent);
 * a stored outbound row shows ✓✓ once the customer has written after it
 * (the provider gives no read receipts here), otherwise ✓.
 */
export function outboundTickFor(messages: InboxMessage[], index: number): DeliveryStatus | null {
  const message = messages[index]
  if (!message || message.direction !== 'outbound') return null
  if (message.deliveryStatus === 'sending' || message.deliveryStatus === 'failed') return message.deliveryStatus
  const answeredLater = messages.slice(index + 1).some((other) => other.direction === 'inbound')
  return answeredLater ? 'delivered' : 'sent'
}
