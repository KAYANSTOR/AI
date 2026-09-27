import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { verifyMetaSignature } from '@/lib/runtime/security'
import { deliverOutbound } from '@/lib/runtime/outbound'

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
  const supabase = createAdminClient()
  let eventRowId: string | null = null
  try {
    const rawBody = await req.text()
    if (!verifyMetaSignature(rawBody, req.headers)) return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })
    const body = JSON.parse(rawBody) as Record<string, unknown>

    for (const entry of (body.entry as Array<Record<string, unknown>> | undefined) ?? []) {
      const accountId = String(entry.id ?? '').trim()

      for (const event of (entry.messaging as Array<Record<string, unknown>> | undefined) ?? []) {
        const sender = event.sender as Record<string, unknown> | undefined
        const message = event.message as Record<string, unknown> | undefined
        const senderId = String(sender?.id ?? '').trim()
        const text = String(message?.text ?? '').trim()
        if (!senderId || !text) continue

        const externalEventId = String(event.message_id ?? event.id ?? crypto.randomUUID())
        const acquired = await acquireWebhookEvent(supabase, 'instagram', externalEventId, event)
        if (acquired.status === 'duplicate') continue
        if (acquired.status === 'error') throw new Error(acquired.message)
        eventRowId = acquired.eventRowId

        // Exact tenant binding: Instagram account ID → channels.provider_account_id.
        const channel = accountId
          ? await resolveChannelExact(supabase, { channelType: 'instagram', providerAccountId: accountId })
          : null
        if (!channel) {
          await markWebhookProcessed(supabase, eventRowId, 'failed', 'unmapped_instagram_account')
          eventRowId = null
          continue
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
          channelType: 'instagram',
          provider: 'meta',
          externalEventId,
          externalUserId: senderId,
          senderUsername: String(sender?.username ?? ''),
          text,
        })

        if (result.reply) {
          await deliverOutbound(supabase, {
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
          })
        }

        await markWebhookProcessed(supabase, eventRowId, 'processed')
        eventRowId = null
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'instagram webhook error'
    if (eventRowId) await markWebhookProcessed(supabase, eventRowId, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
