import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { CredentialConfigError, CredentialMissingError, requireCredential } from '@/lib/credentials/service'
import { resolveChannelProviderCredentials } from '@/lib/credentials/resolve'
import { sendInstagramText, sendWhatsAppText } from '@/lib/providers/meta'
import { sendTwilioSms } from '@/lib/providers/twilio'

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
      payload: { body: input.body },
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
