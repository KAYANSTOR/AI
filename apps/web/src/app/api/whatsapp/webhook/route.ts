import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { normalizeE164 } from '@/lib/channels/contacts'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { verifyMetaSignature } from '@/lib/runtime/security'
import { deliverOutbound } from '@/lib/runtime/outbound'

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

export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  let supabase: ReturnType<typeof createAdminClient> | null = null

  try {
    const rawBody = await req.text()
    // The provider signature is verified before anything privileged exists: an
    // unauthenticated caller must never reach the service-role client.
    if (!verifyMetaSignature(rawBody, req.headers)) {
      return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })
    }

    supabase = createAdminClient()

    const body = JSON.parse(rawBody) as Record<string, unknown>

    for (const entry of (body.entry as Array<Record<string, unknown>> | undefined) ?? []) {
      for (const change of (entry.changes as Array<Record<string, unknown>> | undefined) ?? []) {
        const value = (change.value ?? {}) as Record<string, unknown>
        const messages = (value.messages as Array<Record<string, unknown>> | undefined) ?? []
        if (!messages.length) continue

        const phoneNumberId = String(
          (value.metadata as Record<string, unknown> | undefined)?.phone_number_id ?? ''
        ).trim()
        const profileName = String(
          ((value.contacts as Array<Record<string, unknown>> | undefined)?.[0]?.profile as
            | Record<string, unknown>
            | undefined)?.name ?? ''
        ).trim()

        for (const msg of messages) {
          const from = String(msg.from ?? '').trim()
          const text = String(
            ((msg.text as Record<string, unknown> | undefined)?.body as string | undefined) ?? ''
          ).trim()
          if (!from || !text) continue

          const externalEventId = String(msg.id ?? crypto.randomUUID())
          const acquired = await acquireWebhookEvent(supabase, 'whatsapp', externalEventId, msg)
          if (acquired.status === 'duplicate') continue
          if (acquired.status === 'error') throw new Error(acquired.message)
          eventRowId = acquired.eventRowId

          // Exact tenant binding: WhatsApp phone_number_id → channels.provider_account_id.
          const channel = phoneNumberId
            ? await resolveChannelExact(supabase, {
                channelType: 'whatsapp',
                providerAccountId: phoneNumberId,
              })
            : null

          if (!channel) {
            await markWebhookProcessed(supabase, eventRowId, 'failed', 'unmapped_whatsapp_number')
            eventRowId = null
            continue
          }

          await supabase
            .from('webhook_events')
            .update({
              organization_id: channel.organizationId,
              channel_id: channel.id,
              event_type: 'message.received',
              signature_verified: true,
            })
            .eq('id', eventRowId)

          const result = await processInboundMessage(supabase, {
            organizationId: channel.organizationId,
            businessId: channel.businessId,
            channelId: channel.id,
            channelType: 'whatsapp',
            provider: 'meta',
            externalEventId,
            externalUserId: from,
            senderPhone: normalizeE164(from),
            displayName: profileName || null,
            text,
          })

          if (result.reply) {
            await deliverOutbound(supabase, {
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
              idempotencyKey: 'whatsapp:' + externalEventId + ':reply',
            })
          }

          await markWebhookProcessed(supabase, eventRowId, 'processed')
          eventRowId = null
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'whatsapp webhook error'
    if (supabase && eventRowId) await markWebhookProcessed(supabase, eventRowId, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
