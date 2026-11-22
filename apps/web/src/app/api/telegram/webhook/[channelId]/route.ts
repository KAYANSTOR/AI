import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { loadChannelCredentials, secretEquals } from '@/lib/credentials/service'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { telegramUpdateId } from '@/lib/providers/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TelegramMessage = {
  message_id?: number
  date?: number
  text?: string
  caption?: string
  chat?: { id?: number; type?: string; title?: string; username?: string; first_name?: string; last_name?: string }
  from?: { id?: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string }
}
type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ channelId: string }> }
) {
  let eventRowId: string | null = null
  let db: ReturnType<typeof createAdminClient> | null = null
  try {
    const { channelId } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(channelId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const rawBody = await req.text()
    if (rawBody.length > 1024 * 1024) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    db = createAdminClient()
    const { data: channel, error: channelError } = await db.from('channels')
      .select('id, organization_id, business_id, provider_account_id, external_identifier')
      .eq('id', channelId).eq('channel_type', 'telegram')
      .eq('is_active', true).eq('verification_status', 'verified')
      .maybeSingle()
    if (channelError || !channel?.business_id || !channel.provider_account_id) {
      return NextResponse.json({ error: 'channel_unavailable' }, { status: 404 })
    }

    const credentials = await loadChannelCredentials(db, channel.id, 'telegram')
    const suppliedSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
    if (!credentials.webhook_secret || !secretEquals(suppliedSecret, credentials.webhook_secret)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!credentials.bot_token) {
      return NextResponse.json({ error: 'channel_not_configured' }, { status: 503 })
    }

    const payload = JSON.parse(rawBody) as TelegramUpdate
    const updateId = payload.update_id
    const message = payload.message ?? payload.edited_message
    if (!Number.isSafeInteger(updateId) || !message?.chat?.id || message.from?.is_bot) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const externalEventId = telegramUpdateId(updateId as number)
    const acquired = await acquireWebhookEvent(db, 'telegram', externalEventId, payload)
    if (acquired.status === 'duplicate') return NextResponse.json({ ok: true, duplicate: true })
    if (acquired.status === 'error') return NextResponse.json({ error: 'event_claim_failed' }, { status: 500 })
    eventRowId = acquired.eventRowId

    const exactChannel = await resolveChannelExact(db, {
      channelType: 'telegram',
      providerAccountId: String(channel.provider_account_id),
    })
    if (!exactChannel || exactChannel.id !== channel.id) {
      await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_telegram_bot')
      eventRowId = null
      return NextResponse.json({ ok: true, ignored: true })
    }

    await db.from('webhook_events').update({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      event_type: 'message.received',
      signature_verified: true,
    }).eq('id', eventRowId)

    const text = (message.text ?? message.caption ?? '').trim()
    if (!text) {
      // Non-text Telegram updates are not falsely recorded as text messages.
      await markWebhookProcessed(db, eventRowId, 'processed')
      eventRowId = null
      return NextResponse.json({ ok: true, ignored: true })
    }

    const chatId = String(message.chat.id)
    const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ').trim()
    const result = await processInboundMessage(db, {
      organizationId: exactChannel.organizationId,
      businessId: exactChannel.businessId,
      channelId: exactChannel.id,
      channelType: 'telegram',
      provider: 'telegram',
      externalEventId: String(message.message_id ?? updateId),
      externalUserId: chatId,
      senderUsername: message.from?.username ?? message.chat.username ?? null,
      displayName: displayName || message.chat.title || null,
      text,
    })

    if (result.reply) {
      const delivery = await deliverOutbound(db, {
        channel: {
          id: exactChannel.id,
          organizationId: exactChannel.organizationId,
          businessId: exactChannel.businessId,
          channelType: 'telegram',
          providerAccountId: exactChannel.providerAccountId,
          externalIdentifier: exactChannel.externalIdentifier,
        },
        recipient: chatId,
        body: result.reply,
        idempotencyKey: 'telegram:' + externalEventId + ':reply',
        conversationId: result.conversationId,
      })
      if (delivery === 'sent') {
        await recordDeliveredOutboundMessage(db, {
          organizationId: exactChannel.organizationId,
          conversationId: result.conversationId,
          body: result.reply,
          idempotencyKey: 'telegram:' + externalEventId + ':reply',
        })
      }
    }

    await markWebhookProcessed(db, eventRowId, 'processed')
    eventRowId = null
    return NextResponse.json({ ok: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'telegram_webhook_error'
    if (db && eventRowId) await markWebhookProcessed(db, eventRowId, 'failed', reason)
    console.error('Telegram webhook processing failed', { reason })
    return NextResponse.json({ error: 'webhook_processing_failed' }, { status: 500 })
  }
}
