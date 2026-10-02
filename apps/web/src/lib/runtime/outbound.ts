import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { CredentialConfigError, CredentialMissingError, requireCredential } from '@/lib/credentials/service'
import { resolveChannelProviderCredentials } from '@/lib/credentials/resolve'
import { sendInstagramText, sendWhatsAppText } from '@/lib/providers/meta'
import { sendTwilioSms } from '@/lib/providers/twilio'
import { markFirstResponse } from '@/lib/sla'

export type OutboundChannel = {
  id: string
  organizationId: string
  businessId: string | null
  channelType: string
  providerAccountId: string | null
  externalIdentifier: string | null
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
export async function deliverOutbound(
  supabase: SupabaseClient,
  input: {
    channel: OutboundChannel
    recipient: string
    body: string
    idempotencyKey: string
    conversationId?: string | null
    queueOnFailure?: boolean
  }
): Promise<'sent' | 'queued'> {
  const queueOnFailure = input.queueOnFailure !== false

  let credentials: Record<string, string>
  try {
    credentials = await resolveChannelProviderCredentials(supabase, {
      channelId: input.channel.id,
      channelType: input.channel.channelType,
    })
  } catch (error) {
    // Decryption failure / missing platform key: never retry, never pretend to send.
    if (error instanceof CredentialConfigError) throw error
    throw error
  }

  try {
    await sendViaProvider(input.channel, credentials, input.recipient, input.body)
  } catch (error) {
    if (error instanceof CredentialMissingError || error instanceof CredentialConfigError) {
      // Permanent: retrying cannot succeed. Fail closed and let the caller/operator act.
      throw error
    }
    if (!queueOnFailure) throw error
    await enqueueOutbound({
      supabase,
      organizationId: input.channel.organizationId,
      businessId: input.channel.businessId,
      channelId: input.channel.id,
      eventType: 'message.send',
      idempotencyKey: input.idempotencyKey,
      recipient: input.recipient,
      payload: { body: input.body, conversation_id: input.conversationId ?? null },
    })
    return 'queued'
  }

  await supabase.from('usage_ledger').insert({
    organization_id: input.channel.organizationId,
    business_id: input.channel.businessId,
    event_type: 'message_outbound',
    units: 1,
    reference_type: 'channel',
    reference_id: input.channel.id,
    metadata: { channel_type: input.channel.channelType },
  })

  return 'sent'
}

/** Persist a customer-visible outbound message only after the provider accepted it. */
export async function recordDeliveredOutboundMessage(
  supabase: SupabaseClient,
  input: { organizationId: string; conversationId: string; body: string; idempotencyKey: string; state?: string }
) {
  const { error } = await supabase.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: input.body,
    external_message_id: input.idempotencyKey,
  })
  if (error && error.code !== '23505') throw new Error('outbound_message_record_failed')

  const now = new Date().toISOString()
  const { error: conversationError } = await supabase
    .from('conversations')
    .update({ last_message_at: now, last_outbound_at: now, state: input.state ?? 'waiting_customer' })
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
  if (conversationError) throw new Error('outbound_conversation_update_failed')

  await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    action: 'message.outbound_delivered',
    entity_type: 'conversation',
    entity_id: input.conversationId,
    actor_type: 'system',
    metadata: { idempotency_key: input.idempotencyKey },
  })
  await markFirstResponse(supabase, {
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
    await sendWhatsAppText(
      {
        access_token: requireCredential(credentials, 'meta', 'access_token'),
        // The binding on the channel row is authoritative for which number sends.
        phone_number_id: channel.providerAccountId ?? credentials.phone_number_id,
      },
      recipient,
      body
    )
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
