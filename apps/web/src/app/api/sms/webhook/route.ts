import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { publicWebhookError, verifyTwilioSignature } from '@/lib/runtime/security'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  let supabase: ReturnType<typeof createAdminClient> | null = null
  try {
    const raw = await req.text()
    const params = Object.fromEntries(new URLSearchParams(raw).entries())
    // Signature first: nothing privileged is constructed for an unsigned request.
    if (!verifyTwilioSignature(req.url, params, req.headers.get('x-twilio-signature'))) return new NextResponse('Forbidden', { status: 403 })

    supabase = createAdminClient()

    const from = String(params.From ?? '').trim()
    const to = String(params.To ?? '').trim()
    const body = String(params.Body ?? '').trim()
    const sid = String(params.MessageSid ?? '').trim()
    if (!from || !to || !body) return new NextResponse('OK')
    if (!sid) return new NextResponse('Bad Request', { status: 400 })

    const acquired = await acquireWebhookEvent(supabase, 'twilio', sid, params)
    if (acquired.status === 'duplicate') return new NextResponse('OK')
    if (acquired.status === 'error') return new NextResponse('Server error', { status: 500 })
    eventRowId = acquired.eventRowId

    const channel = await resolveChannelExact(supabase, { channelType: 'sms', externalIdentifier: to })
    if (!channel) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', 'unmapped_twilio_number')
      return new NextResponse('OK')
    }

    await supabase.from('webhook_events').update({
      organization_id: channel.organizationId,
      channel_id: channel.id,
      event_type: 'message.received',
      signature_verified: true,
    }).eq('id', eventRowId)

    const result = await processInboundMessage(supabase, {
      organizationId: channel.organizationId,
      businessId: channel.businessId,
      channelId: channel.id,
      channelType: 'sms',
      provider: 'twilio',
      externalEventId: sid,
      externalUserId: from,
      senderPhone: from,
      text: body,
    })

    if (result.reply) {
      const delivery = await deliverOutbound(supabase, {
        channel: {
          id: channel.id,
          organizationId: channel.organizationId,
          businessId: channel.businessId,
          channelType: 'sms',
          providerAccountId: channel.providerAccountId,
          externalIdentifier: channel.externalIdentifier ?? to,
        },
        recipient: from,
        body: result.reply,
        idempotencyKey: 'sms:' + sid + ':reply',
        conversationId: result.conversationId,
      })
      if (delivery === 'sent') await recordDeliveredOutboundMessage(supabase, {
        organizationId: channel.organizationId,
        conversationId: result.conversationId,
        body: result.reply,
        idempotencyKey: 'sms:' + sid + ':reply',
      })
    }

    await markWebhookProcessed(supabase, eventRowId, 'processed')
    return new NextResponse('OK')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sms webhook error'
    if (supabase && eventRowId) await markWebhookProcessed(supabase, eventRowId, 'failed', message)
    return new NextResponse(publicWebhookError(), { status: 500 })
  }
}
