import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { publicWebhookError, stablePayloadEventId, verifyMetaSignature } from '@/lib/runtime/security'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && process.env.INSTAGRAM_VERIFY_TOKEN && token === process.env.INSTAGRAM_VERIFY_TOKEN && challenge) return new NextResponse(challenge)
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  let db: ReturnType<typeof createAdminClient> | null = null
  try {
    const rawBody = await req.text()
    // Signature first: nothing privileged is constructed for an unsigned request.
    if (!verifyMetaSignature(rawBody, req.headers)) return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })

    db = createAdminClient()
    const body = JSON.parse(rawBody) as Record<string, unknown>

    for (const entry of (body.entry as Array<Record<string, unknown>> | undefined) ?? []) {
      const accountId = String(entry.id ?? '').trim()

      for (const event of (entry.messaging as Array<Record<string, unknown>> | undefined) ?? []) {
        const sender = event.sender as Record<string, unknown> | undefined
        const message = event.message as Record<string, unknown> | undefined
        const senderId = String(sender?.id ?? '').trim()
        const text = String(message?.text ?? '').trim()
        if (!senderId || !text) continue

        const externalEventId = String(event.message_id ?? event.id ?? '').trim() || stablePayloadEventId('instagram', event)
        const acquired = await acquireWebhookEvent(db, 'instagram', externalEventId, event)
        if (acquired.status === 'duplicate') continue
        if (acquired.status === 'error') throw new Error(acquired.message)
        eventRowId = acquired.eventRowId

        // Exact tenant binding: Instagram account ID → channels.provider_account_id.
        const channel = accountId
          ? await resolveChannelExact(db, { channelType: 'instagram', providerAccountId: accountId })
          : null
        if (!channel) {
          await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_instagram_account')
          eventRowId = null
          continue
        }

        await db.from('webhook_events').update({
          organization_id: channel.organizationId,
          channel_id: channel.id,
          event_type: 'message.received',
          signature_verified: true,
        }).eq('id', eventRowId)

        const result = await processInboundMessage(db, {
          organizationId: channel.organizationId,
          businessId: channel.businessId,
          channelId: channel.id,
          channelType: 'instagram',
          provider: 'meta',
          externalEventId,
          externalUserId: senderId,
          senderUsername: String(sender?.username ?? ''),
          text,
        })

        if (result.reply) {
          const delivery = await deliverOutbound(db, {
            channel: {
              id: channel.id,
              organizationId: channel.organizationId,
              businessId: channel.businessId,
              channelType: 'instagram',
              providerAccountId: channel.providerAccountId ?? accountId,
              externalIdentifier: channel.externalIdentifier,
            },
            recipient: senderId,
            body: result.reply,
            idempotencyKey: 'instagram:' + externalEventId + ':reply',
            conversationId: result.conversationId,
          })
          if (delivery === 'sent') await recordDeliveredOutboundMessage(db, {
            organizationId: channel.organizationId,
            conversationId: result.conversationId,
            body: result.reply,
            idempotencyKey: 'instagram:' + externalEventId + ':reply',
          })
        }

        await markWebhookProcessed(db, eventRowId, 'processed')
        eventRowId = null
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'instagram webhook error'
    if (db && eventRowId) await markWebhookProcessed(db, eventRowId, 'failed', message)
    return NextResponse.json({ error: publicWebhookError() }, { status: 500 })
  }
}
