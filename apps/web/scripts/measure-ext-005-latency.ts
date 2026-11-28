/**
 * EXT-005 — synthetic latency baseline for the personal external-contact inbound path.
 *
 * Every stage below runs the real runtime modules against the in-memory PostgREST
 * double from the test suite, so the numbers describe runtime + fake-database work.
 * They deliberately exclude real network latency: the production Postgres round trip,
 * the WhatsApp gateway hop and the provider send are not reproducible in this
 * environment (no credentials, no live project), so no stage here claims a production
 * p50/p95. Request path measured:
 *
 *   qr:<channelId>:<providerMessageId>  ->  acquireWebhookEvent (claim)
 *   -> webhook_events update + inbound_jobs insert (enqueue)
 *   -> claim_inbound_job (worker claim)
 *   -> processInboundMessage (scope gate, deterministic refusal or coordination turn)
 *   -> claimOutboundEvent reserveOnly (durable delivery intent)
 *
 * Run with: bun run scripts/measure-ext-005-latency.ts
 */
import type { DbClient } from '@/lib/db/client'
import { acquireWebhookEvent } from '@/lib/channels/idempotency'
import { claimOutboundEvent } from '@/lib/channels/outbox'
import { planExternalContactTurn } from '@/lib/runtime/external-contact-policy'
import {
  processInboundMessage,
  setAgentTurnRunner,
  setInboundGuardsFactory,
  setInboundOwnerIdentityLookup,
} from '@/lib/runtime/process-inbound'
import { createFakeDb, type FakeDb } from '../tests/support/fake-db'

const ORG = '0c000000-0000-4000-8000-000000000030'
const BIZ = '0c000000-0000-4000-8000-000000000031'
const CHAN = '0c000000-0000-4000-8000-000000000032'
const OWNER_USER = 'c0000000-0000-4000-8000-000000000030'
const OWNER_PHONE = '+12025550110'
const FRIEND_PHONE = '+12025550111'

const COORDINATION_TEXT = 'أوصل رسالة لصاحب الحساب: الاجتماع تأجل إلى الغد'
const OUT_OF_SCOPE_TEXT = 'اكتب لي كود بايثون لفرز قائمة'

function baseTables(): FakeDb {
  return {
    organizations: {
      rows: [{ id: ORG, name: 'حساب شخصي', business_type: 'personal_assistant', ignored_phones: [], vertical_config: {} }],
    },
    organization_members: { rows: [{ id: 'om-1', organization_id: ORG, user_id: OWNER_USER, role: 'owner' }] },
    business_profiles: {
      rows: [{ id: 'bp-1', organization_id: ORG, business_id: BIZ, business_type_id: 'personal_assistant', industry: 'personal_assistant', timezone: 'Asia/Aden', activation_state: 'active' }],
    },
    organization_capabilities: { rows: [] },
    business_types: { rows: [{ id: 'personal_assistant', name: 'مساعد شخصي' }] },
    personal_assistant_links: {
      rows: [{ id: 'link-1', org_id: ORG, user_id: OWNER_USER, whatsapp_phone: OWNER_PHONE, verified_at: '2026-11-26T10:00:00Z', kill_switch_active: false }],
    },
    channels: { rows: [{ id: CHAN, organization_id: ORG, business_id: BIZ, channel_type: 'whatsapp', is_active: true }] },
    contacts: { rows: [] },
    contact_identities: { rows: [] },
    conversations: { rows: [] },
    messages: { rows: [] },
    ai_agents: { rows: [{ id: 'ag-1', organization_id: ORG, business_id: BIZ, slug: 'frontdesk', status: 'active', created_at: '2026-11-26T10:00:00Z' }] },
    businesses: { rows: [{ id: BIZ, organization_id: ORG, status: 'draft' }] },
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
 * Stand-ins for the SECURITY DEFINER functions the runtime calls. They apply the same
 * claim/reclaim rules as the SQL (processing/failed/stale) so the measurement exercises
 * the real call sequence rather than a canned answer.
 */
function createMeasuredDb() {
  const fake = createFakeDb(baseTables(), {
    claim_webhook_event: (args) => {
      const provider = String(args.p_provider)
      const externalId = String(args.p_external_event_id)
      const rows = fake.store.webhook_events.rows ?? []
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
      const staleAt = now.getTime() - 5 * 60 * 1000
      const processingAt = new Date(String(row.processing_started_at ?? row.received_at)).getTime()
      const reclaimable =
        row.processing_status === 'pending' ||
        row.processing_status === 'failed' ||
        (row.processing_status === 'processing' && processingAt <= staleAt)
      if (!reclaimable) return [{ event_row_id: row.id, claimed: false, current_status: row.processing_status }]
      row.processing_status = 'processing'
      row.attempt_count = Number(row.attempt_count ?? 0) + 1
      row.processing_started_at = now.toISOString()
      return [{ event_row_id: row.id, claimed: true, current_status: 'processing' }]
    },
    claim_inbound_job: () => {
      const row = (fake.store.inbound_jobs.rows ?? []).find((item) => item.status === 'queued')
      if (!row) return null
      row.status = 'processing'
      row.locked_at = new Date().toISOString()
      return [{ id: row.id, webhook_event_id: row.webhook_event_id, idempotency_key: row.idempotency_key, attempts: 0, payload: row.payload }]
    },
    reserve_outbound_event: (args) => {
      const rows = fake.store.outbox_events.rows ?? []
      const externalId = String(args.p_idempotency_key)
      const existing = rows.find((item) => item.organization_id === args.p_organization_id && item.idempotency_key === externalId)
      if (existing) return [{ event_id: existing.id, status: existing.status, attempts: existing.attempts ?? 0 }]
      const row = {
        id: `outbox-${rows.length + 1}`,
        organization_id: args.p_organization_id,
        business_id: args.p_business_id,
        channel_id: args.p_channel_id,
        event_type: args.p_event_type,
        idempotency_key: externalId,
        recipient: args.p_recipient,
        payload: args.p_payload,
        status: 'pending',
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      }
      rows.push(row)
      return [{ event_id: row.id, status: 'pending', attempts: 0 }]
    },
  })
  return fake
}

function asDb(fake: ReturnType<typeof createMeasuredDb>): DbClient {
  return fake.client as unknown as DbClient
}

function installGuards() {
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

type Timings = { stage: string; samples: number[] }

const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank] ?? 0
}

function summarize(stage: string, samples: number[]): string {
  const sorted = [...samples].sort((a, b) => a - b)
  const mean = samples.reduce((total, value) => total + value, 0) / Math.max(1, samples.length)
  return [
    stage.padEnd(34),
    String(samples.length).padStart(5),
    percentile(sorted, 50).toFixed(2).padStart(9),
    percentile(sorted, 95).toFixed(2).padStart(9),
    mean.toFixed(2).padStart(9),
    Math.min(...samples).toFixed(2).padStart(9),
    Math.max(...samples).toFixed(2).padStart(9),
  ].join('  ')
}

const header = ['stage'.padEnd(34), 'n'.padStart(5), 'p50 ms'.padStart(9), 'p95 ms'.padStart(9), 'mean ms'.padStart(9), 'min ms'.padStart(9), 'max ms'.padStart(9)].join('  ')

async function timeIt(stage: string, iterations: number, body: (index: number) => Promise<void>): Promise<Timings> {
  const samples: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    await body(index)
    samples.push(performance.now() - started)
  }
  return { stage, samples }
}

async function main() {
  const iterations = Number(process.env.EXT005_ITERATIONS ?? 200)
  const slowModelIterations = Math.min(iterations, Number(process.env.EXT005_SLOW_ITERATIONS ?? 20))
  const modelDelayMs = Number(process.env.EXT005_MODEL_MS ?? 300)
  installGuards()
  setInboundOwnerIdentityLookup(async () => [{ id: OWNER_USER, phone: OWNER_PHONE }])
  setAgentTurnRunner(async () => 'سأوصل رسالتك إلى صاحب الحساب.')

  const results: Timings[] = []

  // 1–2. Gateway ingest: claim the provider event id, then attach channel scope and
  // enqueue the job exactly as /api/whatsapp/qr/inbound does.
  {
    const fake = createMeasuredDb()
    const db = asDb(fake)
    const claims: Timings = { stage: 'gateway.claim', samples: [] }
    const enqueues: Timings = { stage: 'gateway.enqueue', samples: [] }
    const duplicates: Timings = { stage: 'gateway.redelivery_duplicate', samples: [] }
    for (let index = 0; index < iterations; index += 1) {
      const externalEventId = `qr:${CHAN}:synthetic-${index}`
      const claimStarted = performance.now()
      const claimed = await acquireWebhookEvent(db, 'whatsapp', externalEventId, { id: externalEventId, type: 'text' })
      claims.samples.push(performance.now() - claimStarted)
      if (claimed.status !== 'acquired') throw new Error(`expected acquired claim, got ${claimed.status}`)

      const enqueueStarted = performance.now()
      await db.from('webhook_events').update({
        organization_id: ORG,
        channel_id: CHAN,
        event_type: 'message.received',
        signature_verified: true,
      }).eq('id', claimed.eventRowId)
      const { error } = await db.from('inbound_jobs').insert({
        organization_id: ORG,
        business_id: BIZ,
        channel_id: CHAN,
        webhook_event_id: claimed.eventRowId,
        idempotency_key: externalEventId,
        status: 'queued',
        payload: { channelId: CHAN, organizationId: ORG, businessId: BIZ, externalEventId, senderJid: `${FRIEND_PHONE}@s.whatsapp.net`, senderPhone: FRIEND_PHONE, text: COORDINATION_TEXT, provider: 'whatsapp_qr' },
      })
      enqueues.samples.push(performance.now() - enqueueStarted)
      if (error) throw new Error(error.message)

      const duplicateStarted = performance.now()
      const duplicate = await acquireWebhookEvent(db, 'whatsapp', externalEventId, { id: externalEventId, type: 'text' })
      duplicates.samples.push(performance.now() - duplicateStarted)
      if (duplicate.status !== 'duplicate') throw new Error(`expected duplicate, got ${duplicate.status}`)
    }
    results.push(claims, enqueues, duplicates)
  }

  // 3. Worker claim of one queued job.
  {
    const fake = createMeasuredDb()
    await asDb(fake).from('inbound_jobs').insert({
      organization_id: ORG,
      business_id: BIZ,
      channel_id: CHAN,
      idempotency_key: `qr:${CHAN}:queued-1`,
      status: 'queued',
      payload: { channelId: CHAN, organizationId: ORG, businessId: BIZ, externalEventId: `qr:${CHAN}:queued-1`, senderJid: `${FRIEND_PHONE}@s.whatsapp.net`, senderPhone: FRIEND_PHONE, text: COORDINATION_TEXT, provider: 'whatsapp_qr' },
    })
    const claim = await timeIt('worker.claim', iterations, async () => {
      const { data } = await asDb(fake).rpc('claim_inbound_job', { p_worker: 'measure' })
      if (!data) throw new Error('expected a claimable job')
      const row = (Array.isArray(data) ? data[0] : data) as { id: string }
      await asDb(fake).from('inbound_jobs').update({ status: 'queued', locked_at: null }).eq('id', row.id)
    })
    results.push(claim)
  }

  // 4. Processing: deterministic refusal (no provider call by design).
  {
    const fake = createMeasuredDb()
    const db = asDb(fake)
    const processing = await timeIt('process.refuse_no_model', iterations, async (index) => {
      const externalEventId = `qr:${CHAN}:refuse-${index}`
      const result = await processInboundMessage(db, {
        organizationId: ORG,
        businessId: BIZ,
        channelId: CHAN,
        channelType: 'whatsapp',
        provider: 'whatsapp_qr',
        externalEventId,
        externalUserId: `${FRIEND_PHONE}@s.whatsapp.net`,
        senderPhone: FRIEND_PHONE,
        displayName: 'سعيد',
        text: OUT_OF_SCOPE_TEXT,
      })
      if (!result.reply) throw new Error('expected a deterministic refusal')
    })
    results.push(processing)
  }

  // 5. Processing: coordination turn with a zero-latency model (runtime overhead only).
  {
    const fake = createMeasuredDb()
    const db = asDb(fake)
    setAgentTurnRunner(async () => 'سأوصل رسالتك إلى صاحب الحساب.')
    const processing = await timeIt('process.coordination_model_0ms', iterations, async (index) => {
      await processInboundMessage(db, {
        organizationId: ORG,
        businessId: BIZ,
        channelId: CHAN,
        channelType: 'whatsapp',
        provider: 'whatsapp_qr',
        externalEventId: `qr:${CHAN}:coordinate-${index}`,
        externalUserId: `${FRIEND_PHONE}@s.whatsapp.net`,
        senderPhone: FRIEND_PHONE,
        displayName: 'سعيد',
        text: COORDINATION_TEXT,
      })
    })
    results.push(processing)
  }

  // 6. Processing: coordination turn with synthetic model latency, to attribute cost.
  {
    const fake = createMeasuredDb()
    const db = asDb(fake)
    setAgentTurnRunner(async () => {
      await new Promise((resolve) => setTimeout(resolve, modelDelayMs))
      return 'سأوصل رسالتك إلى صاحب الحساب.'
    })
    const processing = await timeIt(`process.coordination_model_${modelDelayMs}ms`, slowModelIterations, async (index) => {
      await processInboundMessage(db, {
        organizationId: ORG,
        businessId: BIZ,
        channelId: CHAN,
        channelType: 'whatsapp',
        provider: 'whatsapp_qr',
        externalEventId: `qr:${CHAN}:slow-${index}`,
        externalUserId: `${FRIEND_PHONE}@s.whatsapp.net`,
        senderPhone: FRIEND_PHONE,
        displayName: 'سعيد',
        text: COORDINATION_TEXT,
      })
    })
    results.push(processing)
  }

  // 7. Delivery intent: reserve the outbound idempotency key (the provider send itself
  // needs credentials and is not measured here).
  {
    const fake = createMeasuredDb()
    const db = asDb(fake)
    const reserve = await timeIt('outbox.reserve_intent', iterations, async (index) => {
      const result = await claimOutboundEvent(db, {
        organizationId: ORG,
        businessId: BIZ,
        channelId: CHAN,
        eventType: 'message.send',
        idempotencyKey: `qr:${CHAN}:reply-${index}`,
        recipient: FRIEND_PHONE,
        payload: { body: 'سأوصل رسالتك إلى صاحب الحساب.' },
        reserveOnly: true,
      })
      if (result.status !== 'queued') throw new Error(`expected queued intent, got ${result.status}`)
    })
    results.push(reserve)
  }

  // Sanity check that the fixture texts are classified as intended before reporting.
  const refusal = planExternalContactTurn({ text: OUT_OF_SCOPE_TEXT, history: [] })
  const coordination = planExternalContactTurn({ text: COORDINATION_TEXT, history: [] })
  if (refusal.action !== 'refuse' || coordination.action !== 'model') {
    throw new Error('fixture classification changed; re-check the measurement inputs')
  }

  console.log('EXT-005 synthetic latency baseline (in-memory PostgREST double, no provider network)')
  console.log(`iterations=${iterations} slow_model_iterations=${slowModelIterations} model_delay=${modelDelayMs}ms`)
  console.log(header)
  for (const result of results) console.log(summarize(result.stage, result.samples))

  const modelBound = results.find((item) => item.stage === `process.coordination_model_${modelDelayMs}ms`)
  const overhead = results.find((item) => item.stage === 'process.coordination_model_0ms')
  if (modelBound && overhead) {
    const modelBoundP50 = percentile([...modelBound.samples].sort((a, b) => a - b), 50)
    const overheadP50 = percentile([...overhead.samples].sort((a, b) => a - b), 50)
    console.log('')
    console.log(`bottleneck attribution: model wait ~${(modelBoundP50 - overheadP50).toFixed(2)} ms of ${modelBoundP50.toFixed(2)} ms p50 coordination turn`)
  }

  setAgentTurnRunner(null)
  setInboundOwnerIdentityLookup(null)
  setInboundGuardsFactory(null)
}

main().catch((error) => {
  console.error('ext_005_measurement_failed', error instanceof Error ? error.message : error)
  process.exit(1)
})
