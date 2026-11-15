import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { normalizeE164 } from '@/lib/channels/contacts'
import { processInboundMessage, recordInboundMediaMessage } from '@/lib/runtime/process-inbound'
import { parseWhatsAppInbound } from '@/lib/channels/whatsapp-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import {
  publicWebhookError,
  stablePayloadEventId,
  verifyKapsoWebhookSignature,
  verifyMetaSignature,
} from '@/lib/runtime/security'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

type NormalizedWebhookValue = {
  metadata?: { phone_number_id?: string }
  contacts?: Array<{ profile?: { name?: string } }>
  messages?: Array<Record<string, unknown>>
}

function normalizeKapsoPayload(payload: Record<string, unknown>): NormalizedWebhookValue {
  const message = payload.message as Record<string, unknown> | undefined
  const conversation = payload.conversation as Record<string, unknown> | undefined
  const kapsoMessage = message?.kapso as Record<string, unknown> | undefined
  const phoneNumberId = String(
    payload.phone_number_id ??
      conversation?.phone_number_id ??
      kapsoMessage?.phone_number_id ??
      ''
  ).trim()

  return {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ profile: { name: String(conversation?.contact_name ?? '').trim() } }],
    messages: message ? [message] : [],
  }
}

export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  let db: ReturnType<typeof createAdminClient> | null = null

  try {
    const rawBody = await req.text()
    const kapsoEvent = req.headers.get('x-webhook-event')
    const isKapsoWebhook = Boolean(kapsoEvent)

    // Verify the exact raw body before parsing JSON or creating a privileged DB client.
    const signatureValid = isKapsoWebhook
      ? verifyKapsoWebhookSignature(rawBody, req.headers)
      : verifyMetaSignature(rawBody, req.headers)

    if (!signatureValid) {
      return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>

    // This endpoint consumes inbound messages only. Acknowledge status and
    // conversation events so Kapso does not retry events this runtime does not use.
    if (isKapsoWebhook && kapsoEvent !== 'whatsapp.message.received') {
      return NextResponse.json({ ok: true, ignored: true })
    }

    let values: NormalizedWebhookValue[] = []

    if (isKapsoWebhook) {
      const isBatch =
        req.headers.get('x-webhook-batch') === 'true' ||
        body.batch === true
      const payloads = isBatch
        ? (Array.isArray(body.data) ? body.data : [])
        : [body]
      values = payloads
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(normalizeKapsoPayload)
    } else {
      const entries = (body.entry as Array<Record<string, unknown>> | undefined) ?? []
      values = entries.flatMap(entry =>
        ((entry.changes as Array<Record<string, unknown>> | undefined) ?? [])
          .map(change => (change.value ?? {}) as NormalizedWebhookValue)
      )
    }

    db = createAdminClient()

    for (const value of values) {
      const messages = value.messages ?? []
      if (!messages.length) continue

      const phoneNumberId = String(value.metadata?.phone_number_id ?? '').trim()
      const profileName = String(value.contacts?.[0]?.profile?.name ?? '').trim()

      for (const msg of messages) {
        const from = String(msg.from ?? '').trim()
        const inbound = parseWhatsAppInbound(msg)
        if (!from || inbound.kind === 'ignored') continue

        const externalEventId =
          String(msg.id ?? '').trim() ||
          stablePayloadEventId(isKapsoWebhook ? 'kapso_whatsapp' : 'whatsapp', msg)
        const acquired = await acquireWebhookEvent(
          db,
          isKapsoWebhook ? 'kapso_whatsapp' : 'whatsapp',
          externalEventId,
          msg
        )
        if (acquired.status === 'duplicate') continue
        if (acquired.status === 'error') throw new Error(acquired.message)
        eventRowId = acquired.eventRowId

        // Exact tenant binding: WhatsApp phone_number_id → channels.provider_account_id.
        const channel = phoneNumberId
          ? await resolveChannelExact(db, {
              channelType: 'whatsapp',
              providerAccountId: phoneNumberId,
            })
          : null

        if (!channel) {
          await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_whatsapp_number')
          eventRowId = null
          continue
        }

        await db
          .from('webhook_events')
          .update({
            organization_id: channel.organizationId,
            channel_id: channel.id,
            event_type: inbound.kind === 'media' ? 'message.media_received' : 'message.received',
            signature_verified: true,
          })
          .eq('id', eventRowId)

        const identity = {
          organizationId: channel.organizationId,
          businessId: channel.businessId,
          channelId: channel.id,
          channelType: 'whatsapp' as const,
          provider: 'meta',
          externalEventId,
          externalUserId: from,
          senderPhone: normalizeE164(from),
          displayName: profileName || null,
        }

        if (inbound.kind === 'media') {
          await recordInboundMediaMessage(db, {
            ...identity,
            messageType: inbound.messageType,
            content: inbound.content,
          })
          await markWebhookProcessed(db, eventRowId, 'processed')
          eventRowId = null
          continue
        }

        const result = await processInboundMessage(db, { ...identity, text: inbound.text })

        if (result.reply) {
          const delivery = await deliverOutbound(db, {
            channel: {
              id: channel.id,
              organizationId: channel.organizationId,
              businessId: channel.businessId,
              channelType: 'whatsapp',
              providerAccountId: channel.providerAccountId ?? phoneNumberId,
              externalIdentifier: channel.externalIdentifier,
            },
            recipient: from,
            body: result.reply,
            idempotencyKey: (isKapsoWebhook ? 'kapso:' : 'whatsapp:') + externalEventId + ':reply',
            conversationId: result.conversationId,
          })
          if (delivery === 'sent') await recordDeliveredOutboundMessage(db, {
            organizationId: channel.organizationId,
            conversationId: result.conversationId,
            body: result.reply,
            idempotencyKey: (isKapsoWebhook ? 'kapso:' : 'whatsapp:') + externalEventId + ':reply',
          })
        }

        await markWebhookProcessed(db, eventRowId, 'processed')
        eventRowId = null
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'whatsapp webhook error'
    if (db && eventRowId) await markWebhookProcessed(db, eventRowId, 'failed', message)
    console.error('WhatsApp webhook processing failed', { reason: message })
    return NextResponse.json({ error: publicWebhookError() }, { status: 500 })
  }
}
