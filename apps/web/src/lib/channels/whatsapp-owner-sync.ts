import type { DbClient } from '@/lib/db/client'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { recordOwnerActivity } from '@/lib/runtime/owner-presence'

export type OwnerWhatsAppMessage = {
  channelId: string
  externalEventId: string
  providerMessageId: string
  contactJid: string
  contactPhone: string | null
  text: string
  sentAt: string
}

const BOT_ECHO_WINDOW_MS = 2 * 60 * 1000

export function parseOwnerWhatsAppMessage(value: unknown): OwnerWhatsAppMessage | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (input.direction !== 'outbound' || input.senderType !== 'human_whatsapp') return null
  const channelId = String(input.channelId ?? '')
  const externalEventId = String(input.externalEventId ?? '')
  const providerMessageId = String(input.providerMessageId ?? '').trim()
  const contactJid = String(input.contactJid ?? '').trim()
  const text = String(input.text ?? '').trim()
  const contactPhoneRaw = typeof input.contactPhone === 'string' ? input.contactPhone.replace(/\D/g, '') : ''
  if (!/^[0-9a-f-]{36}$/i.test(channelId) || !/^qr:[0-9a-f-]{36}:.{1,160}$/i.test(externalEventId)) return null
  if (!providerMessageId || providerMessageId.length > 160 || !contactJid.includes('@') || contactJid.length > 200) return null
  if (!text || text.length > 8000) return null
  const sentAtMs = typeof input.sentAt === 'string' ? Date.parse(input.sentAt) : NaN
  return {
    channelId, externalEventId, providerMessageId, contactJid, text,
    contactPhone: contactPhoneRaw.length >= 7 && contactPhoneRaw.length <= 15 ? contactPhoneRaw : null,
    sentAt: Number.isFinite(sentAtMs) ? new Date(sentAtMs).toISOString() : new Date().toISOString(),
  }
}

export async function syncOwnerWhatsAppMessage(db: DbClient, input: OwnerWhatsAppMessage): Promise<
  { status: 'stored'; conversationId: string } | { status: 'duplicate'; conversationId: string } | { status: 'channel_unavailable' }
> {
  const { data: channel, error: channelError } = await db.from('channels')
    .select('id, organization_id, business_id')
    .eq('id', input.channelId).eq('channel_type', 'whatsapp').eq('connection_mode', 'qr_unofficial')
    .eq('is_active', true).maybeSingle()
  if (channelError || !channel?.business_id) return { status: 'channel_unavailable' }

  const contact = await resolveContactIdentity(db, channel.organization_id, {
    channel: 'whatsapp',
    // Same identity key as the inbound path (senderPhone || senderJid).
    externalUserId: input.contactPhone || input.contactJid,
    phone: input.contactPhone,
    displayName: null,
  })
  const conversationId = await ensureOpenConversation(db, {
    organizationId: channel.organization_id,
    businessId: channel.business_id,
    contactId: contact.contactId,
    channelId: channel.id,
  })

  // Defence in depth: if the gateway restarted between sending an AI/dashboard
  // reply and receiving its echo, do not store the same text twice.
  const since = new Date(Date.parse(input.sentAt) - BOT_ECHO_WINDOW_MS).toISOString()
  const { data: recent } = await db.from('messages')
    .select('id, sender_type')
    .eq('conversation_id', conversationId).eq('direction', 'outbound').eq('content', input.text)
    .gte('created_at', since).limit(1).maybeSingle()
  if (recent?.id && recent.sender_type !== 'human_whatsapp') return { status: 'duplicate', conversationId }

  const { error } = await db.from('messages').insert({
    organization_id: channel.organization_id,
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: input.text,
    external_message_id: input.externalEventId,
    sender_type: 'human_whatsapp',
    is_read: true,
    created_at: input.sentAt,
  })
  if (error) {
    if (error.code === '23505') return { status: 'duplicate', conversationId }
    throw new Error(error.message)
  }
  await db.from('conversations')
    .update({ last_message_at: input.sentAt, last_outbound_at: input.sentAt })
    .eq('id', conversationId).eq('organization_id', channel.organization_id)
  // Every manual owner message renews the sliding pause (default 30 minutes).
  await recordOwnerActivity(db, {
    channelId: channel.id, organizationId: channel.organization_id, conversationId, sentAt: input.sentAt,
  })
  return { status: 'stored', conversationId }
}
