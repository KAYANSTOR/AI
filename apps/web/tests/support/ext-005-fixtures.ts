/**
 * EXT-005 — synthetic fixtures for the WhatsApp QR inbound pipeline.
 *
 * Shared by the regression tests and by scripts/measure-ext-005-latency.ts so the
 * latency numbers and the dedupe assertions describe the same call sequence:
 *
 *   enqueueQrInbound  -> acquireWebhookEvent (claim) -> webhook_events update
 *                     -> inbound_jobs insert (unique idempotency_key)
 *   claimNextJob      -> claim_inbound_job (atomic claim in production SQL)
 *   processClaimedJob -> runInboundJobTurn -> deliverOutbound (durable intent)
 *                     -> markWebhookProcessed -> job completed
 *
 * All identifiers, phones and message texts here are fictional.
 */
import type { DbClient } from '@/lib/db/client'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { runInboundJobTurn, type InboundPayload } from '@/lib/runtime/inbound-job'
import { enqueueInboundJob } from '@/lib/runtime/inbound-enqueue'
import { deliverOutbound } from '@/lib/runtime/outbound'
import {
  setAgentTurnRunner,
  setInboundGuardsFactory,
  setInboundOwnerIdentityLookup,
} from '@/lib/runtime/process-inbound'
import { createFakeDb, type FakeDb } from './fake-db'

export const EXT_ORG = '0c000000-0000-4000-8000-000000000030'
export const EXT_BIZ = '0c000000-0000-4000-8000-000000000031'
export const EXT_CHANNEL = '0c000000-0000-4000-8000-000000000032'
export const EXT_OWNER_USER = 'c0000000-0000-4000-8000-000000000030'
export const EXT_OWNER_PHONE = '+12025550110'
export const EXT_FRIEND_PHONE = '+12025550111'

export const EXT_COORDINATION_TEXT = 'أوصل رسالة لصاحب الحساب: الاجتماع تأجل إلى الغد'
export const EXT_OUT_OF_SCOPE_TEXT = 'اكتب لي كود بايثون لفرز قائمة'

export type ExtJob = {
  id: string
  webhook_event_id: string | null
  idempotency_key: string
  attempts: number
  payload: InboundPayload
}

function baseTables(): FakeDb {
  return {
    organizations: {
      rows: [{ id: EXT_ORG, name: 'حساب شخصي', business_type: 'personal_assistant', ignored_phones: [], vertical_config: {} }],
    },
    organization_members: { rows: [{ id: 'om-1', organization_id: EXT_ORG, user_id: EXT_OWNER_USER, role: 'owner' }] },
    business_profiles: {
      rows: [{
        id: 'bp-1',
        organization_id: EXT_ORG,
        business_id: EXT_BIZ,
        business_type_id: 'personal_assistant',
        industry: 'personal_assistant',
        timezone: 'Asia/Aden',
        activation_state: 'active',
      }],
    },
    organization_capabilities: { rows: [] },
    business_types: { rows: [{ id: 'personal_assistant', name: 'مساعد شخصي' }] },
    personal_assistant_links: {
      rows: [{
        id: 'link-1',
        org_id: EXT_ORG,
        user_id: EXT_OWNER_USER,
        whatsapp_phone: EXT_OWNER_PHONE,
        verified_at: '2026-11-26T10:00:00Z',
        kill_switch_active: false,
      }],
    },
    channels: {
      rows: [{ id: EXT_CHANNEL, organization_id: EXT_ORG, business_id: EXT_BIZ, channel_type: 'whatsapp', is_active: true }],
    },
    contacts: { rows: [] },
    contact_identities: { rows: [] },
    conversations: { rows: [] },
    // Mirrors ux_messages_external (partial unique index in migration 0007).
    messages: {
      rows: [],
      unique: [{
        columns: ['conversation_id', 'external_message_id'],
        where: (row) => row.external_message_id != null,
      }],
    },
    ai_agents: {
      rows: [{ id: 'ag-1', organization_id: EXT_ORG, business_id: EXT_BIZ, slug: 'frontdesk', status: 'active', created_at: '2026-11-26T10:00:00Z' }],
    },
    businesses: { rows: [{ id: EXT_BIZ, organization_id: EXT_ORG, status: 'draft' }] },
    agent_prompt_versions: { rows: [] },
    agent_runs: { rows: [] },
    usage_ledger: { rows: [] },
    knowledge_base: { rows: [] },
    services: { rows: [] },
    business_hours: { rows: [] },
    pending_actions: { rows: [] },
    consent_status: { rows: [] },
    owner_presence: { rows: [] },
    sla_states: { rows: [] },
    audit_events: { rows: [] },
    webhook_events: { unique: [['provider', 'external_event_id']] },
    inbound_jobs: { unique: [['idempotency_key']] },
    outbox_events: { unique: [['organization_id', 'idempotency_key']] },
  }
}

/**
 * The three SECURITY DEFINER functions the pipeline calls, applied with the same
 * claim/reclaim/unique rules as the SQL migrations so the fixtures exercise the real
 * module sequence. Postgres still owns the atomicity; the fake serialises calls.
 */
function rpcHandlers(getStore: () => FakeDb) {
  return {
    claim_webhook_event: (args: Record<string, unknown>) => {
      const provider = String(args.p_provider)
      const externalId = String(args.p_external_event_id)
      const rows = getStore().webhook_events.rows ?? []
      let row = rows.find((item) => item.provider === provider && item.external_event_id === externalId)
      const now = new Date()
      if (!row) {
        row = {
          id: `event-${rows.length + 1}`,
          provider,
          external_event_id: externalId,
          payload: args.p_payload,
          processing_status: 'processing',
          attempt_count: 1,
          processing_started_at: now.toISOString(),
          received_at: now.toISOString(),
        }
        rows.push(row)
        return [{ event_row_id: row.id, claimed: true, current_status: 'processing' }]
      }
      const staleAt = now.getTime() - Number(args.p_stale_after_seconds ?? 300) * 1000
      const processingAt = new Date(String(row.processing_started_at ?? row.received_at)).getTime()
      const reclaimable =
        row.processing_status === 'pending' ||
        row.processing_status === 'failed' ||
        (row.processing_status === 'processing' && processingAt <= staleAt)
      if (!reclaimable) return [{ event_row_id: row.id, claimed: false, current_status: row.processing_status }]
      row.processing_status = 'processing'
      row.attempt_count = Number(row.attempt_count ?? 0) + 1
      row.processing_started_at = now.toISOString()
      row.processed_at = null
      row.error_message = null
      return [{ event_row_id: row.id, claimed: true, current_status: 'processing' }]
    },

    claim_inbound_job: (args: Record<string, unknown>) => {
      const worker = String(args.p_worker ?? 'worker')
      const queued = (getStore().inbound_jobs.rows ?? [])
        .filter((item) => item.status === 'queued')
        .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
      const row = queued[0]
      if (!row) return null
      row.status = 'processing'
      row.locked_at = new Date().toISOString()
      row.locked_by = worker
      row.attempts = Number(row.attempts ?? 0) + 1
      return [{
        id: row.id,
        webhook_event_id: row.webhook_event_id,
        idempotency_key: row.idempotency_key,
        attempts: row.attempts,
        payload: row.payload,
      }]
    },

    reserve_outbound_event: (args: Record<string, unknown>) => {
      const rows = getStore().outbox_events.rows ?? []
      const key = String(args.p_idempotency_key)
      const existing = rows.find(
        (item) => item.organization_id === args.p_organization_id && item.idempotency_key === key
      )
      if (existing) return [{ event_id: existing.id, status: existing.status, attempts: existing.attempts ?? 0 }]
      const row = {
        id: `outbox-${rows.length + 1}`,
        organization_id: args.p_organization_id,
        business_id: args.p_business_id,
        channel_id: args.p_channel_id,
        event_type: args.p_event_type,
        idempotency_key: key,
        recipient: args.p_recipient,
        payload: args.p_payload,
        status: 'pending',
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      }
      rows.push(row)
      return [{ event_id: row.id, status: 'pending', attempts: 0 }]
    },
  }
}

export function createExtWorld() {
  // The handlers need the store, and the store needs the handlers; resolve the
  // reference after the single client is built so both share one set of rows.
  let store: FakeDb | null = null
  const world = createFakeDb(baseTables(), rpcHandlers(() => store ?? world.store))
  store = world.store
  return { fake: world, store: world.store, db: world.client as unknown as DbClient }
}

export function installExtGuards() {
  setInboundGuardsFactory(() => ({
    policy: async () => ({
      planCode: 'growth',
      free: false,
      dailyLimit: null,
      monthlyLimit: 1000,
      mediaMonthly: null,
      mediaMaxBytes: 5 * 1024 * 1024,
      audioMaxSeconds: 60,
      documentsAllowed: true,
      maxInputChars: 2000,
      maxOutputTokens: null,
      floodPerMinute: 10,
      economy: false,
    }),
    fingerprints: async () => [],
    consumeQuota: async () => ({ allowed: true }),
    consumeFlood: async () => true,
    coalesceMs: 0,
  }))
}

/** Mirrors /api/whatsapp/qr/inbound after signature and payload validation. */
export async function enqueueQrInbound(
  db: DbClient,
  args: { eventId: string; text: string; senderPhone?: string | null }
): Promise<{ status: 'acquired' | 'duplicate' | 'error'; eventRowId?: string; jobId?: string; requeued?: boolean; message?: string }> {
  const claimed = await acquireWebhookEvent(db, 'whatsapp', args.eventId, { id: args.eventId, type: 'text' })
  if (claimed.status !== 'acquired') {
    return { status: claimed.status, message: claimed.status === 'error' ? claimed.message : undefined }
  }

  await db.from('webhook_events').update({
    organization_id: EXT_ORG,
    channel_id: EXT_CHANNEL,
    event_type: 'message.received',
    signature_verified: true,
  }).eq('id', claimed.eventRowId)

  const queued = await enqueueInboundJob(db, {
    organizationId: EXT_ORG,
    businessId: EXT_BIZ,
    channelId: EXT_CHANNEL,
    webhookEventId: claimed.eventRowId,
    idempotencyKey: args.eventId,
    payload: {
      channelId: EXT_CHANNEL,
      organizationId: EXT_ORG,
      businessId: EXT_BIZ,
      externalEventId: args.eventId,
      senderJid: `${(args.senderPhone ?? EXT_FRIEND_PHONE).replace(/\D/g, '')}@s.whatsapp.net`,
      senderPhone: args.senderPhone ?? EXT_FRIEND_PHONE,
      displayName: 'سعيد',
      text: args.text,
      provider: 'whatsapp_qr',
    },
  })

  if (!queued.ok) {
    await markWebhookProcessed(db, claimed.eventRowId, 'failed', queued.message)
    return { status: 'error', eventRowId: claimed.eventRowId, message: queued.message }
  }
  return {
    status: 'acquired',
    eventRowId: claimed.eventRowId,
    jobId: queued.jobId ?? undefined,
    requeued: queued.requeued,
  }
}

export async function claimNextJob(db: DbClient): Promise<ExtJob | null> {
  const { data, error } = await db.rpc('claim_inbound_job', { p_worker: 'synthetic-worker' })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as ExtJob | null
  return row?.id ? row : null
}

/** The worker body from inbound-worker.ts: turn -> durable reply intent -> completion. */
export async function processClaimedJob(
  db: DbClient,
  job: ExtJob
): Promise<{
  reply: string | null
  conversationId: string
  delivery: 'sent' | 'queued' | 'blocked'
  deduplication?: 'duplicate_suppressed' | 'duplicate_resumed'
}> {
  const input = job.payload
  const metrics: { attempts?: number; modelMs?: number } = { attempts: job.attempts }
  const result = await runInboundJobTurn(db, input, {}, metrics)
  let delivery: 'sent' | 'queued' | 'blocked' = 'queued'
  if (result.reply) {
    delivery = await deliverOutbound(db, {
      channel: {
        id: input.channelId,
        organizationId: input.organizationId,
        businessId: input.businessId,
        channelType: 'whatsapp',
        connectionMode: 'qr_unofficial',
        providerAccountId: input.providerAccountId ?? null,
        externalIdentifier: input.externalIdentifier ?? null,
      },
      recipient: input.senderPhone ?? input.senderJid,
      body: result.reply,
      idempotencyKey: `${input.externalEventId}:reply`,
      conversationId: result.conversationId || null,
      senderType: 'ai',
    })
  }
  if (job.webhook_event_id) await markWebhookProcessed(db, job.webhook_event_id, 'processed')
  await db.from('inbound_jobs').update({
    status: 'completed',
    locked_at: null,
    locked_by: null,
    completed_at: new Date().toISOString(),
  }).eq('id', job.id)
  return {
    reply: result.reply,
    conversationId: result.conversationId,
    delivery,
    ...(result.deduplication ? { deduplication: result.deduplication } : {}),
  }
}

export async function primeOwnerLookup() {
  setInboundOwnerIdentityLookup(async () => [{ id: EXT_OWNER_USER, phone: EXT_OWNER_PHONE }])
}

export function resetExtRunners() {
  setAgentTurnRunner(null)
  setInboundOwnerIdentityLookup(null)
  setInboundGuardsFactory(null)
}
