import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueOutbound } from '@/lib/channels/outbox'
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
 * Provider send → outbox fallback (reliability layer) → usage evidence.
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

  try {
    await sendViaProvider(input.channel, input.recipient, input.body)
  } catch (error) {
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

async function sendViaProvider(channel: OutboundChannel, recipient: string, body: string) {
  if (channel.channelType === 'sms') {
    await sendTwilioSms({ to: recipient, from: channel.externalIdentifier ?? '', body })
    return
  }
  if (channel.channelType === 'whatsapp') {
    await sendWhatsAppText(channel.providerAccountId ?? '', recipient, body)
    return
  }
  if (channel.channelType === 'instagram') {
    await sendInstagramText(channel.providerAccountId ?? '', recipient, body)
    return
  }
  throw new Error('unsupported_outbound_channel:' + channel.channelType)
}
