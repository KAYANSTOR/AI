import type { ThreadMessage } from '@/lib/inbox/messages'

/** Window event connecting the reply composer to its sibling message thread. */
export const INBOX_OPTIMISTIC_EVENT = 'kayan:inbox-optimistic'

export type InboxOptimisticDetail =
  | { kind: 'append'; conversationId: string; clientId: string; content: string; createdAt: string }
  | { kind: 'confirm'; conversationId: string; clientId: string; confirmed: ThreadMessage | null; delivery: 'sent' | 'queued' | 'blocked' }
  | { kind: 'fail'; conversationId: string; clientId: string }

export function emitInboxOptimistic(detail: InboxOptimisticDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<InboxOptimisticDetail>(INBOX_OPTIMISTIC_EVENT, { detail }))
}
