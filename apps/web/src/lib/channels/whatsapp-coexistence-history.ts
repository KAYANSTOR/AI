import type { DbClient } from '@/lib/db/client'
import { normalizeE164, resolveContactIdentity } from '@/lib/channels/contacts'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { parseWhatsAppInbound } from '@/lib/channels/whatsapp-inbound'
import { stablePayloadEventId } from '@/lib/runtime/security'

type Json = Record<string, unknown>

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Json
    : {}
}

function array(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Meta sends Unix seconds; tolerate milliseconds and numeric strings too. */
export function parseWhatsAppHistoryTimestamp(value: unknown): string | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d{9,13}$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const milliseconds = numeric >= 100_000_000_000 ? numeric : numeric * 1000
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * In Coexistence history, an included recipient field identifies messages echoed
 * from the Business App. A sender matching the connected business number is a
 * second safe signal.
 */
export function isWhatsAppHistoryOutbound(
  message: Json,
  businessPhoneNumber: string | null | undefined
): boolean {
  if (text(message.to)) return true
  const from = text(message.from)
  const business = text(businessPhoneNumber)
  if (!from || !business) return false
  return normalizeE164(from) === normalizeE164(business)
}

function latest(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => Boolean(value))
  if (!valid.length) return null
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
}

function later(current: unknown, candidate: string | null): string | null {
  if (!candidate) return typeof current === 'string' ? current : null
  if (typeof current !== 'string' || !Number.isFinite(Date.parse(current))) return candidate
  return Date.parse(candidate) > Date.parse(current) ? candidate : current
}

export type WhatsAppHistoryImportResult = {
  threads: number
  inserted: number
  duplicates: number
  skipped: number
}

export async function importWhatsAppCoexistenceHistory(
  db: DbClient,
  input: {
    organizationId: string
    businessId: string | null
    channelId: string
    businessPhoneNumber: string | null
    history: Json[]
  }
): Promise<WhatsAppHistoryImportResult> {
  const result: WhatsAppHistoryImportResult = {
    threads: 0,
    inserted: 0,
    duplicates: 0,
    skipped: 0,
  }

  for (const chunk of input.history) {
    for (const thread of array(chunk.threads)) {
      const threadId = text(thread.id)
      const messages = array(thread.messages)
      const remotePhone = normalizeE164(threadId)
      if (!remotePhone || !messages.length) {
        result.skipped += messages.length
        continue
      }

      const prepared = messages.map((message) => {
        const parsed = parseWhatsAppInbound(message)
        const createdAt = parseWhatsAppHistoryTimestamp(message.timestamp) ?? new Date().toISOString()
        const outbound = isWhatsAppHistoryOutbound(message, input.businessPhoneNumber)
        const messageId = text(message.id) || stablePayloadEventId(
          'whatsapp_history_message',
          { thread: threadId, message }
        )
        return { message, parsed, createdAt, outbound, messageId }
      }).filter((entry) => entry.parsed.kind !== 'ignored')

      if (!prepared.length) {
        result.skipped += messages.length
        continue
      }

      const contactData = object(thread.contact)
      const displayName = text(thread.full_name) ||
        text(contactData.full_name) ||
        text(contactData.name) ||
        text(thread.name) ||
        null

      const contact = await resolveContactIdentity(db, input.organizationId, {
        channel: 'whatsapp',
        externalUserId: threadId,
        phone: remotePhone,
        displayName,
      })

      const newestThreadMessage = latest(prepared.map((entry) => entry.createdAt))
      const conversationId = await ensureOpenConversation(db, {
        organizationId: input.organizationId,
        businessId: input.businessId,
        contactId: contact.contactId,
        channelId: input.channelId,
        initialLastMessageAt: newestThreadMessage ?? undefined,
      })

      let newestInbound: string | null = null
      let newestOutbound: string | null = null

      for (const entry of prepared) {
        const inbound = entry.parsed
        let messageType: 'text' | 'image' | 'audio' | 'video' | 'file'
        let content: string
        if (inbound.kind === 'text') {
          messageType = 'text'
          content = inbound.text
        } else if (inbound.kind === 'media') {
          messageType = inbound.messageType
          content = inbound.content
        } else {
          result.skipped++
          continue
        }
        const { error } = await db.from('messages').insert({
          organization_id: input.organizationId,
          conversation_id: conversationId,
          direction: entry.outbound ? 'outbound' : 'inbound',
          message_type: messageType,
          content,
          external_message_id: entry.messageId,
          created_at: entry.createdAt,
          is_read: true,
        })

        if (error?.code === '23505') {
          result.duplicates++
        } else if (error) {
          throw new Error('whatsapp_history_message_insert_failed')
        } else {
          result.inserted++
        }

        if (entry.outbound) newestOutbound = latest([newestOutbound, entry.createdAt])
        else newestInbound = latest([newestInbound, entry.createdAt])
      }

      const { data: currentConversation, error: conversationReadError } = await db
        .from('conversations')
        .select('last_message_at, last_inbound_at, last_outbound_at')
        .eq('id', conversationId)
        .eq('organization_id', input.organizationId)
        .maybeSingle()
      if (conversationReadError) throw new Error('whatsapp_history_conversation_read_failed')

      const patch: Record<string, unknown> = {}
      const lastMessageAt = later(currentConversation?.last_message_at, newestThreadMessage)
      const lastInboundAt = later(currentConversation?.last_inbound_at, newestInbound)
      const lastOutboundAt = later(currentConversation?.last_outbound_at, newestOutbound)
      if (lastMessageAt) patch.last_message_at = lastMessageAt
      if (lastInboundAt) patch.last_inbound_at = lastInboundAt
      if (lastOutboundAt) patch.last_outbound_at = lastOutboundAt

      if (Object.keys(patch).length) {
        const { error: conversationUpdateError } = await db.from('conversations')
          .update(patch)
          .eq('id', conversationId)
          .eq('organization_id', input.organizationId)
        if (conversationUpdateError) throw new Error('whatsapp_history_conversation_update_failed')
      }

      result.threads++
    }
  }

  return result
}

/** Persist phase/chunk progress and the user's decision to share or decline history. */
export async function updateWhatsAppHistorySyncProgress(
  db: DbClient,
  input: {
    channelId: string
    phoneNumberId: string
    history: Json[]
    errors?: Json[]
  }
): Promise<void> {
  const errors = [
    ...(input.errors ?? []),
    ...input.history.flatMap((chunk) => array(chunk.errors)),
  ]
  const declined = errors.find((error) => Number(error.code) === 2593109)
  if (declined) {
    const { error } = await db.from('whatsapp_coexistence_sync_requests')
      .update({
        status: 'declined',
        error_code: 2593109,
        error_message: 'history_sharing_declined_by_business',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('channel_id', input.channelId)
      .eq('phone_number_id', input.phoneNumberId)
      .eq('sync_type', 'history')
    if (error) throw new Error('whatsapp_history_sync_state_update_failed')
    return
  }

  let bestProgress: number | null = null
  let lastPhase: number | null = null
  let lastChunkOrder: number | null = null
  for (const chunk of input.history) {
    const metadata = object(chunk.metadata)
    const progress = Number(metadata.progress)
    if (Number.isFinite(progress)) bestProgress = Math.max(bestProgress ?? 0, Math.min(100, Math.max(0, progress)))
    const phase = Number(metadata.phase)
    const chunkOrder = Number(metadata.chunk_order)
    if (Number.isFinite(phase)) lastPhase = phase
    if (Number.isFinite(chunkOrder)) lastChunkOrder = chunkOrder
  }
  if (bestProgress === null && lastPhase === null && lastChunkOrder === null) return

  const completed = bestProgress !== null && bestProgress >= 100
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (bestProgress !== null) patch.last_progress = Math.round(bestProgress)
  if (lastPhase !== null) patch.last_phase = lastPhase
  if (lastChunkOrder !== null) patch.last_chunk_order = lastChunkOrder
  if (completed) {
    patch.status = 'completed'
    patch.completed_at = new Date().toISOString()
  }
  const { error } = await db.from('whatsapp_coexistence_sync_requests')
    .update(patch)
    .eq('channel_id', input.channelId)
    .eq('phone_number_id', input.phoneNumberId)
    .eq('sync_type', 'history')
  if (error) throw new Error('whatsapp_history_sync_state_update_failed')
}
