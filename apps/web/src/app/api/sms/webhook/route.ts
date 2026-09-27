import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { verifyTwilioSignature } from '@/lib/runtime/security'
import { sendTwilioSms } from '@/lib/providers/twilio'
import { enqueueOutbound } from '@/lib/channels/outbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  let eventRowId: string | null = null
  try {
    const raw = await req.text()
    const params = Object.fromEntries(new URLSearchParams(raw).entries())
    if (!verifyTwilioSignature(req.url, params, req.headers.get('x-twilio-signature'))) return new NextResponse('Forbidden', { status: 403 })

    const from = String(params.From ?? '').trim()
    const to = String(params.To ?? '').trim()
    const body = String(params.Body ?? '').trim()
    const sid = String(params.MessageSid ?? crypto.randomUUID())
    if (!from || !to || !body) return new NextResponse('OK')

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
      try {
        await sendTwilioSms({ to: from, from: to, body: result.reply })
      } catch {
        await enqueueOutbound({
          supabase,
          organizationId: channel.organizationId,
          businessId: channel.businessId,
          channelId: channel.id,
          eventType: 'message.send',
          idempotencyKey: 'sms:' + sid + ':reply',
          recipient: from,
          payload: { body: result.reply },
        })
      }
    }

    await markWebhookProcessed(supabase, eventRowId, 'processed')
    return new NextResponse('OK')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sms webhook error'
    if (eventRowId) await markWebhookProcessed(supabase, eventRowId, 'failed', message)
    return new NextResponse('Server error', { status: 500 })
  }
}
