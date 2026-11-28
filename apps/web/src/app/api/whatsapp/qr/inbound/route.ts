import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { secretEquals } from '@/lib/credentials/service'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { enqueueInboundJob } from '@/lib/runtime/inbound-enqueue'
import { fromBaileysDescriptor } from '@/lib/media/attachment'
import { evaluateQrChannelReadiness, type QrChannelReadinessRow } from '@/lib/channels/qr-readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type GatewayInbound = {
  channelId?: string
  externalEventId?: string
  senderJid?: string
  senderPhone?: string | null
  displayName?: string | null
  text?: string
  /** Media descriptor (no bytes): kind, mimeType, fileLength, seconds, ptt, fileName, caption, messageId. */
  media?: Record<string, unknown> | null
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
    const media = /^[0-9a-f-]{36}$/i.test(channelId) && input.media && typeof input.media === 'object'
      ? fromBaileysDescriptor(channelId, input.media)
      : null
    if (!/^[0-9a-f-]{36}$/i.test(channelId) ||
        !/^qr:[0-9a-f-]{36}:.{1,160}$/i.test(externalEventId) ||
        !senderJid || (!text && !media) || text.length > 8000 || (input.media && !media)) {
      return NextResponse.json({ error: 'invalid_inbound_payload' }, { status: 400 })
    }
    db = createAdminClient()
    const { data: channel, error: channelError } = await db.from('channels')
      .select('id, organization_id, business_id, provider_account_id, external_identifier, connection_mode, verification_status, is_active')
      .eq('id', channelId).eq('channel_type', 'whatsapp').eq('connection_mode', 'qr_unofficial')
      .maybeSingle()
    // OPS-001: pairing/restore writes this readiness before the gateway forwards a
    // message; the gateway also retries this 404 because the binding write can trail
    // the WhatsApp socket by a few milliseconds. Keep the gate strict, but log the
    // exact reason so a real regression is diagnosable without message content.
    const readiness = evaluateQrChannelReadiness(channelError ? null : (channel as QrChannelReadinessRow | null))
    if (!readiness.ready) {
      console.warn('whatsapp_qr_inbound_channel_unavailable', {
        channelId,
        reason: channelError ? 'lookup_failed' : readiness.reason,
        verificationStatus: channel?.verification_status ?? null,
        isActive: channel?.is_active ?? null,
      })
      return NextResponse.json({ error: 'channel_unavailable' }, { status: 404 })
    }
    const claimed = await acquireWebhookEvent(db, 'whatsapp', externalEventId, input)
    if (claimed.status === 'duplicate') return NextResponse.json({ ok: true, duplicate: true })
    if (claimed.status === 'error') return NextResponse.json({ error: 'event_claim_failed' }, { status: 500 })
    eventRowId = claimed.eventRowId
    await db.from('webhook_events').update({
      organization_id: channel.organization_id, channel_id: channel.id,
      event_type: media ? 'message.media_received' : 'message.received', signature_verified: true,
    }).eq('id', eventRowId)
    const queued = await enqueueInboundJob(db, {
      organizationId: channel.organization_id,
      businessId: channel.business_id,
      channelId: channel.id,
      webhookEventId: eventRowId,
      idempotencyKey: externalEventId,
      payload: {
        channelId: channel.id,
        organizationId: channel.organization_id,
        businessId: channel.business_id,
        externalEventId,
        senderJid,
        senderPhone: input.senderPhone || null,
        displayName: input.displayName || null,
        text,
        media,
        provider: 'whatsapp_qr',
        providerAccountId: channel.provider_account_id,
        externalIdentifier: channel.external_identifier,
      },
    })
    if (!queued.ok) {
      await markWebhookProcessed(db, eventRowId, 'failed', queued.message)
      eventRowId = null
      return NextResponse.json({ error: 'inbound_job_enqueue_failed' }, { status: 500 })
    }
    eventRowId = null
    return NextResponse.json({ ok: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'whatsapp_qr_inbound_error'
    if (db && eventRowId) await markWebhookProcessed(db, eventRowId, 'failed', reason)
    console.error('WhatsApp QR inbound processing failed', { reason })
    return NextResponse.json({ error: 'inbound_processing_failed' }, { status: 500 })
  }
}
