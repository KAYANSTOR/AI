import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { secretEquals } from '@/lib/credentials/service'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type GatewayInbound = {
  channelId?: string
  externalEventId?: string
  senderJid?: string
  senderPhone?: string | null
  displayName?: string | null
  text?: string
}
export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  const expected = process.env.WHATSAPP_GATEWAY_TOKEN?.trim() ?? ''
  const authorization = req.headers.get('authorization') ?? ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expected || !secretEquals(supplied, expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let db: ReturnType<typeof createAdminClient> | null = null
  try {
    const raw = await req.text()
    if (raw.length > 32 * 1024) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    const input = JSON.parse(raw) as GatewayInbound
    const channelId = String(input.channelId ?? '')
    const externalEventId = String(input.externalEventId ?? '')
    const senderJid = String(input.senderJid ?? '').trim()
    const text = String(input.text ?? '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(channelId) ||
        !/^qr:[0-9a-f-]{36}:.{1,160}$/i.test(externalEventId) ||
        !senderJid || !text || text.length > 8000) {
      return NextResponse.json({ error: 'invalid_inbound_payload' }, { status: 400 })
    }
    db = createAdminClient()
    const { data: channel, error: channelError } = await db.from('channels')
      .select('id, organization_id, business_id, provider_account_id, external_identifier, connection_mode')
      .eq('id', channelId).eq('channel_type', 'whatsapp').eq('connection_mode', 'qr_unofficial')
      .eq('verification_status', 'verified').eq('is_active', true).maybeSingle()
    if (channelError || !channel?.business_id) return NextResponse.json({ error: 'channel_unavailable' }, { status: 404 })
    const claimed = await acquireWebhookEvent(db, 'whatsapp', externalEventId, input)
    if (claimed.status === 'duplicate') return NextResponse.json({ ok: true, duplicate: true })
    if (claimed.status === 'error') return NextResponse.json({ error: 'event_claim_failed' }, { status: 500 })
    eventRowId = claimed.eventRowId
    await db.from('webhook_events').update({
      organization_id: channel.organization_id, channel_id: channel.id,
      event_type: 'message.received', signature_verified: true,
    }).eq('id', eventRowId)
    const result = await processInboundMessage(db, {
      organizationId: channel.organization_id, businessId: channel.business_id,
      channelId: channel.id, channelType: 'whatsapp', provider: 'whatsapp',
      externalEventId, externalUserId: input.senderPhone || senderJid,
      senderPhone: input.senderPhone || null, displayName: input.displayName || null, text,
    })
    if (result.reply) {
      const delivery = await deliverOutbound(db, {
        channel: {
          id: channel.id, organizationId: channel.organization_id, businessId: channel.business_id,
          channelType: 'whatsapp', providerAccountId: channel.provider_account_id,
          externalIdentifier: channel.external_identifier,
        },
        recipient: input.senderPhone || senderJid, body: result.reply,
        idempotencyKey: externalEventId + ':reply', conversationId: result.conversationId,
      })
      if (delivery === 'sent') await recordDeliveredOutboundMessage(db, {
        organizationId: channel.organization_id, conversationId: result.conversationId,
        body: result.reply, idempotencyKey: externalEventId + ':reply',
      })
    }
    await markWebhookProcessed(db, eventRowId, 'processed')
    eventRowId = null
    return NextResponse.json({ ok: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'whatsapp_qr_inbound_error'
    if (db && eventRowId) await markWebhookProcessed(db, eventRowId, 'failed', reason)
    console.error('WhatsApp QR inbound processing failed', { reason })
    return NextResponse.json({ error: 'inbound_processing_failed' }, { status: 500 })
  }
}
