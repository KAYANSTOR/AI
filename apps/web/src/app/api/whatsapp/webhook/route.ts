import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { normalizeE164, resolveContactIdentity } from '@/lib/channels/contacts'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { processInboundMessage, recordInboundMediaMessage } from '@/lib/runtime/process-inbound'
import { parseWhatsAppInbound } from '@/lib/channels/whatsapp-inbound'
import { importWhatsAppCoexistenceHistory, updateWhatsAppHistorySyncProgress } from '@/lib/channels/whatsapp-coexistence-history'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import {
  publicWebhookError,
  stablePayloadEventId,
  verifyKapsoWebhookSignature,
  verifyMetaSignature,
} from '@/lib/runtime/security'
import { deliverOutbound, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { normalizeWhatsAppInbound } from '@/lib/channels/whatsapp-provider-adapter'

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
  field?: string
  wabaId?: string
  event?: string
  metadata?: { phone_number_id?: string }
  contacts?: Array<{ profile?: { name?: string } }>
  messages?: Array<Record<string, unknown>>
  message_echoes?: Array<Record<string, unknown>>
  state_sync?: Array<Record<string, unknown>>
  history?: Array<Record<string, unknown>>
  errors?: Array<Record<string, unknown>>
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
    field: 'messages',
    messages: message ? [message] : [],
  }
}

export async function POST(req: NextRequest) {
  let eventRowId: string | null = null
  let db: ReturnType<typeof createAdminClient> | null = null

  try {
    const rawBody = Buffer.from(await req.arrayBuffer())
    const kapsoEvent = req.headers.get('x-webhook-event')
    const isKapsoWebhook = Boolean(kapsoEvent)

    // Verify the exact raw body before parsing JSON or creating a privileged DB client.
    const signatureValid = isKapsoWebhook
      ? verifyKapsoWebhookSignature(rawBody.toString('utf8'), req.headers)
      : verifyMetaSignature(rawBody, req.headers)

    if (!signatureValid) {
      return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>

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
          .map(change => ({ ...((change.value ?? {}) as NormalizedWebhookValue), field: String(change.field ?? 'messages'), wabaId: String(entry.id ?? '') }))
      )
    }

    db = createAdminClient()

    for (const value of values) {
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '').trim()
      const profileName = String(value.contacts?.[0]?.profile?.name ?? '').trim()
      const field = value.field ?? 'messages'

      // Persist Coexistence account lifecycle events and disable offboarded tenants.
      if (field === 'account_update') {
        const wabaId = String(value.wabaId ?? '').trim()
        const event = String(value.event ?? '').trim()
        const eventId = stablePayloadEventId('whatsapp_account_update', { wabaId, event, value })
        const acquired = await acquireWebhookEvent(db, 'whatsapp_account_update', eventId, value)
        if (acquired.status === 'duplicate') continue
        if (acquired.status === 'error') throw new Error(acquired.message)
        eventRowId = acquired.eventRowId
        const { data: channels, error: channelError } = await db.from('channels')
          .select('id, organization_id').eq('waba_id', wabaId).eq('channel_type', 'whatsapp')
        if (channelError) throw new Error(channelError.message)
        if (!channels?.length) {
          await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_whatsapp_waba')
          eventRowId = null
          continue
        }
        const organizationIds = Array.from(new Set(channels.map((channel) => channel.organization_id)))
        if (organizationIds.length !== 1) {
          await markWebhookProcessed(db, eventRowId, 'failed', 'ambiguous_whatsapp_waba_mapping')
          eventRowId = null
          continue
        }
        const organizationId = organizationIds[0]
        const channelIds = channels.map((channel) => channel.id)
        if (event === 'ACCOUNT_OFFBOARDED' || event === 'PARTNER_REMOVED') {
          const { error } = await db.from('channels').update({
            verification_status: 'disabled', is_active: false, updated_at: new Date().toISOString(),
          }).eq('organization_id', organizationId).in('id', channelIds)
          if (error) throw new Error(error.message)
        } else if (event === 'ACCOUNT_RECONNECTED') {
          const { error } = await db.from('channels').update({
            verification_status: 'pending', is_active: false, updated_at: new Date().toISOString(),
          }).eq('organization_id', organizationId).in('id', channelIds)
          if (error) throw new Error(error.message)
        }
        await db.from('webhook_events').update({
          organization_id: organizationId, channel_id: channelIds[0],
          event_type: 'channel.meta_account_update', signature_verified: true,
        }).eq('id', eventRowId)
        await markWebhookProcessed(db, eventRowId, 'processed')
        eventRowId = null
        continue
      }

      const channelForSync = phoneNumberId
        ? await resolveChannelExact(db, { channelType: 'whatsapp', providerAccountId: phoneNumberId })
        : null

      // The dedicated smb_message_echoes field is always outbound, even when
      // Meta uses the generic "messages" property in its envelope.
      const isAppEchoField = field === 'smb_message_echoes'
      const messages = [
        ...(value.messages ?? []).map((message) => ({ message, isAppEcho: isAppEchoField })),
        ...(value.message_echoes ?? []).map((message) => ({ message, isAppEcho: true })),
      ]

      if (field === 'history') {
        const historyId = stablePayloadEventId('whatsapp_coexistence_history', value)
        const acquired = await acquireWebhookEvent(db, 'whatsapp_coexistence_history', historyId, value)
        if (acquired.status === 'duplicate') continue
        if (acquired.status === 'error') throw new Error(acquired.message)
        eventRowId = acquired.eventRowId
        await db.from('webhook_events').update({
          organization_id: channelForSync?.organizationId ?? null,
          channel_id: channelForSync?.id ?? null,
          event_type: 'coexistence.history_importing',
          signature_verified: true,
        }).eq('id', eventRowId)

        if (!channelForSync) {
          await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_whatsapp_number')
          eventRowId = null
          continue
        }

        await updateWhatsAppHistorySyncProgress(db, {
          channelId: channelForSync.id,
          phoneNumberId,
          history: value.history ?? [],
          errors: value.errors ?? [],
        })
        await importWhatsAppCoexistenceHistory(db, {
          organizationId: channelForSync.organizationId,
          businessId: channelForSync.businessId,
          channelId: channelForSync.id,
          businessPhoneNumber: channelForSync.externalIdentifier,
          history: value.history ?? [],
        })

        await db.from('webhook_events').update({
          event_type: 'coexistence.history_imported',
        }).eq('id', eventRowId)
        await markWebhookProcessed(db, eventRowId, 'processed')
        eventRowId = null
        continue
      }

      if (field === 'smb_app_state_sync') {
        if (!channelForSync) continue
        for (const syncItem of value.state_sync ?? []) {
          const contactData = (syncItem.contact ?? syncItem) as Record<string, unknown>
          const phone = String(contactData.phone_number ?? contactData.wa_id ?? '').trim()
          if (!phone) continue
          const itemId = stablePayloadEventId('whatsapp_app_contact_sync', syncItem)
          const acquired = await acquireWebhookEvent(db, 'whatsapp_app_contact_sync', itemId, syncItem)
          if (acquired.status === 'duplicate') continue
          if (acquired.status === 'error') throw new Error(acquired.message)
          eventRowId = acquired.eventRowId
          const action = String(syncItem.action ?? 'add').trim().toLowerCase()

          if (action === 'remove' || action === 'delete') {
            const { data: identity, error: identityReadError } = await db.from('contact_identities')
              .select('id, contacts!inner(organization_id)')
              .eq('channel', 'whatsapp')
              .eq('external_user_id', phone)
              .eq('contacts.organization_id', channelForSync.organizationId)
              .maybeSingle()
            if (identityReadError) throw new Error(identityReadError.message)
            if (identity?.id) {
              const { error: identityDeleteError } = await db.from('contact_identities')
                .delete().eq('id', identity.id)
              if (identityDeleteError) throw new Error(identityDeleteError.message)
            }
          } else {
            const fullName = String(contactData.full_name ?? contactData.first_name ?? '').trim()
            await resolveContactIdentity(db, channelForSync.organizationId, {
              channel: 'whatsapp', externalUserId: phone, phone: normalizeE164(phone), displayName: fullName || null,
            })
          }

          await db.from('webhook_events').update({
            organization_id: channelForSync.organizationId, channel_id: channelForSync.id,
            event_type: action === 'remove' || action === 'delete'
              ? 'contact.whatsapp_app_removed'
              : 'contact.whatsapp_app_synced',
            signature_verified: true,
          }).eq('id', eventRowId)
          await markWebhookProcessed(db, eventRowId, 'processed')
          eventRowId = null
        }
        continue
      }

      for (const item of messages) {
        const msg = item.message
        const isAppEcho = item.isAppEcho
        const from = String(msg.from ?? '').trim()
        const to = String(msg.to ?? '').trim()
        const remotePhone = isAppEcho ? to : from
        const inbound = parseWhatsAppInbound(msg)
        if (!remotePhone || inbound.kind === 'ignored') continue

        const externalEventId = String(msg.id ?? '').trim() ||
          stablePayloadEventId(isAppEcho ? 'whatsapp_app_echo' : isKapsoWebhook ? 'kapso_whatsapp' : 'whatsapp', msg)
        const eventProvider = isAppEcho ? 'whatsapp_app_echo' : isKapsoWebhook ? 'kapso_whatsapp' : 'whatsapp'
        const acquired = await acquireWebhookEvent(db, eventProvider, externalEventId, msg)
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

        const normalized = normalizeWhatsAppInbound(msg, {
          provider: 'meta',
          connectionMode: channel.connectionMode === 'qr_unofficial'
            ? 'qr_unofficial'
            : channel.connectionMode === 'coexistence' ? 'coexistence' : 'cloud_api',
          from: remotePhone,
          to: to || null,
        })

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
          externalUserId: remotePhone,
          senderPhone: normalizeE164(remotePhone),
          displayName: profileName || null,
        }

        if (isAppEcho) {
          if (!channelForSync) {
            await markWebhookProcessed(db, eventRowId, 'failed', 'unmapped_whatsapp_number')
            eventRowId = null
            continue
          }
          const contact = await resolveContactIdentity(db, channelForSync.organizationId, {
            channel: 'whatsapp', externalUserId: remotePhone, phone: normalizeE164(remotePhone), displayName: null,
          })
          const conversationId = await ensureOpenConversation(db, {
            organizationId: channelForSync.organizationId, businessId: channelForSync.businessId,
            contactId: contact.contactId, channelId: channelForSync.id,
          })
          await recordDeliveredOutboundMessage(db, {
            organizationId: channelForSync.organizationId, conversationId,
            body: inbound.kind === 'media' ? inbound.content : inbound.text,
            idempotencyKey: 'whatsapp-app-echo:' + externalEventId,
            externalMessageId: externalEventId,
            messageType: inbound.kind === 'media' ? inbound.messageType : 'text',
          })
          await db.from('webhook_events').update({
            organization_id: channelForSync.organizationId, channel_id: channelForSync.id,
            event_type: 'message.whatsapp_app_echo', signature_verified: true,
          }).eq('id', eventRowId)
          await markWebhookProcessed(db, eventRowId, 'processed')
          eventRowId = null
          continue
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

        const result = await processInboundMessage(db, { ...identity, text: normalized.text ?? inbound.text })

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
            messageType: 'text',
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
