import type { DbClient } from '@/lib/db/client'
import { deliverOutbound, deliverWhatsAppTemplate, isPermanentOutboundError, recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_LOCK_MS,
  nextOutboxFailureState,
} from '@/lib/channels/outbox'
import { isBusinessInitiatedEvent } from '@/lib/channels/whatsapp-window'
import { renderTemplateBody, type WhatsAppTemplateRow } from '@/lib/channels/whatsapp-templates'
import { planBusinessWhatsApp, type WhatsAppTemplatePayload } from '@/lib/channels/whatsapp-dispatch'

export class OutboxDrainError extends Error {}

/**
 * Delivers due outbox events. Shared by the HTTP cron endpoint and the
 * long-running inbound worker so queued replies and retries never depend on
 * the (best-effort, often delayed) external scheduler alone.
 */
export async function drainOutbox(
  db: DbClient,
  { limit = 50, only }: { limit?: number; only?: { organizationId: string; idempotencyKey: string } } = {}
): Promise<{ processed: number; sent: number; sentEventIds: string[] }> {
  // Stale workers (crashed mid-send) leave rows in 'processing'; they become claimable
  // again after the lock window instead of being stuck forever.
  const staleBefore = new Date(Date.now() - OUTBOX_STALE_LOCK_MS).toISOString()
  const claimable = `status.in.(pending,failed),and(status.eq.processing,locked_at.lt.${staleBefore})`
  // `only` drains a single just-queued reply (dashboard send) without touching other tenants' rows.
  let query = db.from('outbox_events')
    .select('id, organization_id, channel_id, event_type, recipient, payload, attempts, idempotency_key')
  if (only) query = query.eq('organization_id', only.organizationId).eq('idempotency_key', only.idempotencyKey)
  const { data: events, error } = await query
    .or(claimable)
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', OUTBOX_MAX_ATTEMPTS)
    .order('scheduled_at')
    .limit(limit)
  if (error) throw new OutboxDrainError(error.message)

  // One lookup for every channel in this batch instead of one per event.
  const channelIds = [...new Set((events ?? []).map((event) => event.channel_id as string | null).filter((id): id is string => Boolean(id)))]
  const channelsResult = channelIds.length
    ? await db.from('channels')
        .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier, connection_mode, is_active')
        .in('id', channelIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  const channelsById = new Map<string, Record<string, unknown>>()
  for (const row of channelsResult.data ?? []) channelsById.set(row.id as string, row)

  let sent = 0
  const sentEventIds: string[] = []
  for (const event of events ?? []) {
    let providerAccepted = false
    let selectedChannel: { channel_type?: string | null; connection_mode?: string | null } | undefined
    const claim = await db.from('outbox_events')
      .update({ status: 'processing', attempts: Number(event.attempts ?? 0) + 1, locked_at: new Date().toISOString() })
      .eq('id', event.id)
      .or(claimable)
      .select('id')
      .maybeSingle()
    if (!claim.data) continue

    try {
      // A failed batch lookup fails each event individually (same retry/backoff path as before).
      if (channelsResult.error) throw new Error(channelsResult.error.message)
      const channel = channelsById.get(event.channel_id as string) as
        | {
            id: string
            organization_id: string
            business_id: string | null
            channel_type: string
            provider_account_id: string | null
            external_identifier: string | null
            connection_mode: string | null
            is_active: boolean
          }
        | undefined
      if (!channel) throw new Error('channel_not_found')
      selectedChannel = channel

      const payload = event.payload as Record<string, unknown>
      const body = String(payload.body ?? '')
      const personalTaskId = typeof payload.personal_task_id === 'string' ? payload.personal_task_id : null
      if (payload.kind === 'personal_assistant') {
        if (!channel.is_active) throw new Error('personal_assistant_channel_inactive')
        if (personalTaskId) {
          const task = await db.from('personal_tasks').select('id, status, due_at, reminder_sent_at')
            .eq('id', personalTaskId).eq('organization_id', event.organization_id).maybeSingle()
          const stillDue = task.data && ['pending', 'snoozed'].includes(String(task.data.status)) && !task.data.reminder_sent_at && task.data.due_at && new Date(task.data.due_at).getTime() <= Date.now()
          if (!stillDue) {
            await db.from('outbox_events').update({ status: 'cancelled', locked_at: null, updated_at: new Date().toISOString(), last_error: 'personal_task_no_longer_due' }).eq('id', event.id).eq('status', 'processing')
            continue
          }
        }
      }

      const conversationId = typeof payload.conversation_id === 'string' ? payload.conversation_id : null
      const explicitTemplate = payload.whatsapp_template as WhatsAppTemplatePayload | undefined
      let templateToSend: WhatsAppTemplatePayload | undefined
      let approvedTemplateRow: WhatsAppTemplateRow | null = null

      // Business-initiated WhatsApp messages must respect Meta's 24-hour window: free
      // text inside it, an approved template outside it, and an explicit failure (with
      // audit) when no approved template exists instead of a silent provider rejection.
      if (channel.channel_type === 'whatsapp' && channel.connection_mode !== 'qr_unofficial') {
        const initiatedBy =
          payload.initiated_by === 'business' || payload.kind === 'personal_assistant' || isBusinessInitiatedEvent(String(event.event_type ?? ''))
            ? 'business'
            : 'customer'
        if (initiatedBy === 'business') {
          const plan = await planBusinessWhatsApp(db, {
            organizationId: event.organization_id,
            channelId: channel.id,
            connectionMode: channel.connection_mode,
            recipient: event.recipient,
            conversationId,
            explicitTemplate: explicitTemplate ?? null,
            templateVariables: payload.template_variables,
          })
          if (plan.kind === 'blocked') {
            await db.from('outbox_events').update({
              status: 'dead_letter',
              locked_at: null,
              last_error: 'whatsapp_template_required_outside_window',
              updated_at: new Date().toISOString(),
            }).eq('id', event.id).eq('status', 'processing')
            await db.from('audit_events').insert({
              organization_id: event.organization_id,
              actor_type: 'system',
              action: 'whatsapp.template_required',
              entity_type: 'outbox_event',
              entity_id: String(event.id),
              metadata: {
                reason: plan.reason,
                event_type: event.event_type ?? null,
                channel_id: channel.id,
                window: { last_inbound_at: plan.lastInboundAt },
              },
            })
            continue
          }
          if (plan.kind === 'template') {
            templateToSend = plan.template
            approvedTemplateRow = plan.resolvedRow
            if (!explicitTemplate) {
              // Persist the resolved template on the durable intent for auditability.
              await db.from('outbox_events').update({
                template_name: plan.template.name,
                template_language_code: plan.template.languageCode,
                template_variables_json: plan.template.bodyParameters ?? [],
                updated_at: new Date().toISOString(),
              }).eq('id', event.id).eq('status', 'processing')
            }
          }
        }
      }

      // Same delivery path as the live routes; failures here are recorded by the
      // worker itself so retries and dead-letter stay authoritative.
      const outboundChannel = {
        id: channel.id,
        organizationId: channel.organization_id,
        businessId: channel.business_id,
        channelType: channel.channel_type,
        providerAccountId: channel.provider_account_id,
        externalIdentifier: channel.external_identifier,
        connectionMode: channel.connection_mode as string | null,
      }
      if (templateToSend) {
        await deliverWhatsAppTemplate(db, { channel: outboundChannel, recipient: event.recipient, template: templateToSend })
      } else {
        await deliverOutbound(db, {
          channel: outboundChannel,
          recipient: event.recipient,
          body,
          idempotencyKey: 'outbox:' + event.id,
          conversationId,
          queueOnFailure: false,
        })
      }

      // The provider accepted the message. Mark the durable intent sent before
      // maintaining the inbox projection, so a bookkeeping error never resends it.
      providerAccepted = true
      const { error: sentError } = await db.from('outbox_events').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id).eq('status', 'processing')
      if (sentError) throw new Error('outbox_sent_state_update_failed: ' + sentError.message)

      if (personalTaskId) {
        await db.from('personal_tasks').update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', personalTaskId).eq('organization_id', event.organization_id).is('reminder_sent_at', null)
      }

      if (typeof payload.conversation_id === 'string' && payload.conversation_id) {
        // The inbox projection shows the rendered template, not an empty text body.
        const projectionBody = templateToSend
          ? renderTemplateBody(approvedTemplateRow?.body_text ?? body, templateToSend.bodyParameters ?? []) || body
          : body
        await recordDeliveredOutboundMessage(db, {
          organizationId: event.organization_id,
          conversationId: payload.conversation_id,
          body: projectionBody,
          idempotencyKey: 'outbox:' + event.id,
          senderType: payload.sender_type === 'ai' || payload.sender_type === 'human_dashboard' || payload.sender_type === 'system' ? payload.sender_type : undefined,
        })
      }

      sent++
      sentEventIds.push(String(event.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'outbox delivery failed'
      if (providerAccepted) {
        console.error('Outbound provider accepted message but inbox projection failed', {
          outboxEventId: event.id,
          provider: selectedChannel?.channel_type === 'whatsapp' && selectedChannel?.connection_mode === 'qr_unofficial' ? 'baileys' : 'meta',
          connection_mode: selectedChannel?.connection_mode ?? null,
          reason: message.slice(0, 240),
        })
        sentEventIds.push(String(event.id))
        continue
      }
      const permanent = isPermanentOutboundError(error)
      const failure = nextOutboxFailureState(Number(event.attempts ?? 0) + 1)
      await db.from('outbox_events').update({
        status: permanent ? 'dead_letter' : failure.status,
        last_error: message.slice(0, 500),
        scheduled_at: permanent ? new Date().toISOString() : failure.nextAttemptAt,
        locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id)
    }
  }
  return { processed: events?.length ?? 0, sent, sentEventIds }
}
