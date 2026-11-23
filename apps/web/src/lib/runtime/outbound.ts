import type { DbClient } from '@/lib/db/client'
import { createAdminClient } from '@/lib/db/admin'
import { claimOutboundEvent, nextOutboxFailureState } from '@/lib/channels/outbox'
import { CredentialConfigError, CredentialMissingError, requireCredential } from '@/lib/credentials/service'
import { resolveChannelProviderCredentials } from '@/lib/credentials/resolve'
import { MetaApiError, sendInstagramText, sendWhatsAppTemplate, type WhatsAppTemplateInput } from '@/lib/providers/meta'
import { sendTwilioSms } from '@/lib/providers/twilio'
import { sendTelegramText } from '@/lib/providers/telegram'
import { sendMessengerText } from '@/lib/providers/messenger'
import { markFirstResponse } from '@/lib/sla'
import { adapterForWhatsAppMode, type WhatsAppConnectionMode } from '@/lib/channels/whatsapp-provider-adapter'

/**
 * Provider credentials are intentionally inaccessible through the tenant-scoped
 * browser/server client (provider_credentials has no member SELECT policy).
 * Resolve them with the service-role client only after verifying that the supplied
 * channel belongs to the same organization and provider type.
 */
async function resolveOwnedChannelCredentials(channel: OutboundChannel): Promise<Record<string, string>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('channels')
    .select('id, connection_mode, is_active')
    .eq('id', channel.id)
    .eq('organization_id', channel.organizationId)
    .eq('channel_type', channel.channelType)
    .maybeSingle()

  if (error) throw new Error('تعذّر التحقق من قناة الإرسال.')
  if (!data) throw new Error('قناة الإرسال لا تتبع النشاط الحالي.')

  if (data.connection_mode === 'qr_unofficial' && data.is_active !== true) {
    throw new Error('قناة واتساب متوقفة حالياً.')
  }
  if (data.connection_mode === 'qr_unofficial') {
    return { __connection_mode: 'qr_unofficial', __channel_id: String(data.id) }
  }
  const credentials = await resolveChannelProviderCredentials(admin, {
    channelId: data.id,
    channelType: channel.channelType,
  })
  return { ...credentials, __connection_mode: data.connection_mode ?? '' }
}

export type OutboundChannel = {
  id: string
  organizationId: string
  businessId: string | null
  channelType: string
  providerAccountId: string | null
  externalIdentifier: string | null
  connectionMode?: WhatsAppConnectionMode | string | null
}

/**
 * One outbound path for every message channel.
 *
 * Credentials are resolved per channel through CredentialService, so a business sends
 * with its own provider identity. A missing credential is a permanent configuration
 * fault: the outbox retry loop cannot fix it, so it fails loudly instead of burning
 * every retry and dead-lettering the message.
 *
 * Provider send → transient failure queued to the outbox → usage evidence.
 * The outbox worker reuses this function with queueOnFailure disabled, because the
 * worker itself is the retry path and must record its own failure state.
 */
export function isPermanentOutboundError(error: unknown): boolean {
  if (error instanceof CredentialMissingError || error instanceof CredentialConfigError) return true
  if (error instanceof MetaApiError) {
    return !([408, 425, 429].includes(error.status) || error.status >= 500)
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError) return false
    if (/(?:is required|are required|unsupported_outbound_channel:)/i.test(error.message)) return true
    const status = /HTTP\s+(\d{3})/i.exec(error.message)?.[1]
    if (status) {
      const code = Number(status)
      return !([408, 425, 429].includes(code) || code >= 500)
    }
  }
  // Unknown failures (for example a transient database error while resolving
  // credentials) are retried with a bounded policy rather than discarded.
  return false
}

/**
 * Durable outbound path:
 * - reserve the unique idempotency key before sending;
 * - only one inline request can claim that intent;
 * - transient errors remain in the outbox for retry;
 * - permanent provider/configuration errors are parked as dead letters.
 *
 * The outbox worker passes queueOnFailure=false because it has already claimed the row.
 */
export async function deliverOutbound(
  db: DbClient,
  input: {
    channel: OutboundChannel
    recipient: string
    body: string
    idempotencyKey: string
    conversationId?: string | null
    queueOnFailure?: boolean
  }
): Promise<'sent' | 'queued' | 'blocked'> {
  const queueOnFailure = input.queueOnFailure !== false
  const claim = queueOnFailure
    ? await claimOutboundEvent(db, {
        organizationId: input.channel.organizationId,
        businessId: input.channel.businessId,
        channelId: input.channel.id,
        eventType: 'message.send',
        idempotencyKey: input.idempotencyKey,
        recipient: input.recipient,
        payload: { body: input.body, conversation_id: input.conversationId ?? null },
      })
    : null

  if (claim?.status === 'sent') return 'sent'
  if (claim?.status === 'blocked') return 'blocked'
  if (claim?.status === 'queued') return 'queued'
  // HTTP/webhook paths only create the durable intent. The outbox worker is the
  // only path allowed to call an external WhatsApp provider.
  if (queueOnFailure) return 'queued'

  let credentials: Record<string, string>
  try {
    credentials = await resolveOwnedChannelCredentials(input.channel)
    await sendViaProvider(input.channel, credentials, input.recipient, input.body)
  } catch (error) {
    if (!queueOnFailure || !claim || claim.status !== 'claimed') throw error

    const permanent = isPermanentOutboundError(error)
    const retry = nextOutboxFailureState(claim.attempts)
    const nextStatus = permanent ? 'dead_letter' : retry.status
    const { error: stateError } = await db
      .from('outbox_events')
      .update({
        status: nextStatus,
        last_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        scheduled_at: permanent ? new Date().toISOString() : retry.nextAttemptAt,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.eventId)
      .eq('status', 'processing')

    if (stateError) throw new Error('outbound_failure_state_update_failed: ' + stateError.message)

    if (permanent) {
      await db.from('audit_events').insert({
        organization_id: input.channel.organizationId,
        business_id: input.channel.businessId,
        actor_type: 'provider',
        action: 'message.delivery_blocked',
        entity_type: 'conversation',
        entity_id: input.conversationId ?? null,
        metadata: {
          channel_type: input.channel.channelType,
          provider: input.channel.channelType === 'whatsapp' && input.channel.connectionMode === 'qr_unofficial' ? 'baileys' : 'meta',
          connection_mode: input.channel.connectionMode ?? null,
          idempotency_key: input.idempotencyKey,
          reason: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        },
      })
    }

    return permanent || nextStatus === 'dead_letter' ? 'blocked' : 'queued'
  }

  if (queueOnFailure && claim?.status === 'claimed') {
    const { data: markedSent, error: sentError } = await db
      .from('outbox_events')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.eventId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle()

    if (sentError || !markedSent?.id) {
      throw new Error('outbound_sent_state_update_failed: ' + (sentError?.message ?? 'claim_lost'))
    }
  }

  return 'sent'
}

/** Persist a customer-visible outbound message only after the provider accepted it. */

/**
 * Sends the first business-initiated WhatsApp message as an approved template.
 * Rejected templates are policy/configuration errors, not retryable queue items.
 */
export async function deliverWhatsAppTemplate(
  db: DbClient,
  input: {
    channel: OutboundChannel
    recipient: string
    template: WhatsAppTemplateInput
  }
): Promise<{ messageId: string | null }> {
  if (input.channel.channelType !== 'whatsapp') {
    throw new Error('إرسال قوالب البداية متاح لقناة WhatsApp فقط.')
  }
  if (!input.channel.providerAccountId) {
    throw new CredentialMissingError('meta', 'phone_number_id')
  }

  const credentials = await resolveOwnedChannelCredentials(input.channel)
  if (credentials.__connection_mode === 'qr_unofficial') {
    throw new Error('قوالب WhatsApp المعتمدة متاحة فقط عبر ربط Meta Cloud API.')
  }

  const result = await sendWhatsAppTemplate(
    {
      access_token: requireCredential(credentials, 'meta', 'access_token'),
      phone_number_id: input.channel.providerAccountId,
    },
    input.recipient,
    input.template
  )

  await db.from('usage_ledger').insert({
    organization_id: input.channel.organizationId,
    business_id: input.channel.businessId,
    event_type: 'message_outbound',
    units: 1,
    reference_type: 'channel',
    reference_id: input.channel.id,
    metadata: { channel_type: 'whatsapp', message_kind: 'template' },
  })

  return result
}

export async function recordDeliveredOutboundMessage(
  db: DbClient,
  input: {
    organizationId: string
    conversationId: string
    body: string
    idempotencyKey: string
    state?: string
    externalMessageId?: string | null
    messageType?: 'text' | 'image' | 'audio' | 'video' | 'file'
  }
) {
  const { error } = await db.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    direction: 'outbound',
    message_type: input.messageType ?? 'text',
    content: input.body,
    external_message_id: input.externalMessageId || input.idempotencyKey,
  })
  if (error && error.code !== '23505') throw new Error('outbound_message_record_failed')

  const now = new Date().toISOString()
  const { error: conversationError } = await db
    .from('conversations')
    .update({ last_message_at: now, last_outbound_at: now, state: input.state ?? 'waiting_customer' })
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
  if (conversationError) throw new Error('outbound_conversation_update_failed')

  await db.from('audit_events').insert({
    organization_id: input.organizationId,
    action: 'message.outbound_delivered',
    entity_type: 'conversation',
    entity_id: input.conversationId,
    actor_type: 'system',
    metadata: { idempotency_key: input.idempotencyKey },
  })
  await markFirstResponse(db, {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
  })

  return 'sent'
}

async function sendViaProvider(
  channel: OutboundChannel,
  credentials: Record<string, string>,
  recipient: string,
  body: string
) {
  if (channel.channelType === 'messenger') {
    if (!channel.providerAccountId) throw new CredentialMissingError('meta', 'page_id')
    await sendMessengerText({
      pageId: channel.providerAccountId,
      pageAccessToken: requireCredential(credentials, 'meta', 'page_access_token'),
      recipientPsid: recipient,
      text: body,
    })
    return
  }

  if (channel.channelType === 'telegram') {
    await sendTelegramText({
      token: requireCredential(credentials, 'telegram', 'bot_token'),
      chatId: recipient,
      text: body,
    })
    return
  }

  if (channel.channelType === 'sms') {
    const from = channel.externalIdentifier ?? ''
    if (!from) throw new CredentialMissingError('twilio', 'from_number')
    await sendTwilioSms(
      {
        account_sid: requireCredential(credentials, 'twilio', 'account_sid'),
        auth_token: requireCredential(credentials, 'twilio', 'auth_token'),
      },
      { to: recipient, from, body }
    )
    return
  }

  if (channel.channelType === 'whatsapp') {
    const connectionMode = credentials.__connection_mode ?? channel.connectionMode ?? 'cloud_api'
    const adapter = adapterForWhatsAppMode(connectionMode)
    console.info('WhatsApp outbound provider selected', {
      provider: adapter.provider,
      connection_mode: connectionMode,
      channel_id: channel.id,
    })
    if (adapter.provider === 'meta') requireCredential(credentials, 'meta', 'access_token')
    await adapter.sendText({
      credentials,
      from: channel.providerAccountId ?? credentials.phone_number_id ?? channel.externalIdentifier ?? '',
      to: recipient,
      body,
      channelId: channel.id,
    })
    return
  }

  if (channel.channelType === 'instagram') {
    await sendInstagramText(
      {
        access_token: requireCredential(credentials, 'meta', 'access_token'),
        account_id: channel.providerAccountId ?? '',
      },
      recipient,
      body
    )
    return
  }

  throw new Error('unsupported_outbound_channel:' + channel.channelType)
}
