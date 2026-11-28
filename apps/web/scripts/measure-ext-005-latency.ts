/**
 * EXT-005 — synthetic latency baseline for the personal external-contact inbound path.
 *
 * Every stage runs the real runtime modules against the in-memory PostgREST double
 * from the test suite. The numbers therefore describe runtime + fake-database work
 * only: the production Postgres round trip, the WhatsApp gateway hop and the provider
 * send are not reproducible here (no credentials, no live project), so this reports a
 * local baseline, never a production p50/p95. Queue wait is not measured; it is bounded
 * by the worker poll interval and the outbox drain interval printed at the end.
 *
 * Path: qr:<channelId>:<providerMessageId> -> claim -> enqueue -> job claim
 *       -> processInboundMessage -> outbound intent reserve -> processed.
 *
 * Run with: bun run scripts/measure-ext-005-latency.ts
 * Optional env: EXT005_ITERATIONS (default 200), EXT005_SLOW_ITERATIONS (20), EXT005_MODEL_MS (300).
 */
import {
  EXT_CHANNEL,
  EXT_BIZ,
  EXT_FRIEND_PHONE,
  EXT_ORG,
  claimNextJob,
  createExtWorld,
  enqueueQrInbound,
  installExtGuards,
  primeOwnerLookup,
  processClaimedJob,
} from '../tests/support/ext-005-fixtures'
import { planExternalContactTurn } from '@/lib/runtime/external-contact-policy'
import { setAgentTurnRunner, processInboundMessage } from '@/lib/runtime/process-inbound'
import { runInboundJobTurn } from '@/lib/runtime/inbound-job'
import { deliverOutbound } from '@/lib/runtime/outbound'

const COORDINATION_TEXT = 'أوصل رسالة لصاحب الحساب: الاجتماع تأجل إلى الغد'
const OUT_OF_SCOPE_TEXT = 'اكتب لي كود بايثون لفرز قائمة'
const INBOUND_WORKER_POLL_MS = 1500
const OUTBOX_DRAIN_INTERVAL_MS = 10_000

type Timings = { stage: string; samples: number[] }

const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank] ?? 0
}

function summarize({ stage, samples }: Timings): string {
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

async function main() {
  const iterations = Number(process.env.EXT005_ITERATIONS ?? 200)
  const slowIterations = Math.min(iterations, Number(process.env.EXT005_SLOW_ITERATIONS ?? 20))
  const modelDelayMs = Number(process.env.EXT005_MODEL_MS ?? 300)
  installExtGuards()
  await primeOwnerLookup()
  setAgentTurnRunner(async () => 'سأوصل رسالتك إلى صاحب الحساب.')

  const results: Timings[] = []

  // 1–3. Gateway ingest: claim the provider event id, enqueue the job, then replay it.
  {
    const { db, store } = createExtWorld()
    const claims: Timings = { stage: 'gateway.claim_and_enqueue', samples: [] }
    const duplicates: Timings = { stage: 'gateway.redelivery_duplicate', samples: [] }
    for (let index = 0; index < iterations; index += 1) {
      const eventId = `qr:${EXT_CHANNEL}:measure-${index}`
      const started = performance.now()
      const first = await enqueueQrInbound(db, { eventId, text: COORDINATION_TEXT })
      claims.samples.push(performance.now() - started)
      if (first.status !== 'acquired') throw new Error(`expected acquired, got ${first.status}`)

      const replayStarted = performance.now()
      const replay = await enqueueQrInbound(db, { eventId, text: COORDINATION_TEXT })
      duplicates.samples.push(performance.now() - replayStarted)
      if (replay.status !== 'duplicate') throw new Error(`expected duplicate, got ${replay.status}`)
    }
    if ((store.inbound_jobs.rows ?? []).length !== iterations) throw new Error('duplicate enqueue created extra jobs')
    results.push(claims, duplicates)
  }

  // 4. Worker claim.
  {
    const { db } = createExtWorld()
    for (let index = 0; index < iterations; index += 1) {
      await enqueueQrInbound(db, { eventId: `qr:${EXT_CHANNEL}:claim-${index}`, text: COORDINATION_TEXT })
    }
    const samples: number[] = []
    for (let index = 0; index < iterations; index += 1) {
      const started = performance.now()
      const job = await claimNextJob(db)
      samples.push(performance.now() - started)
      if (!job) throw new Error('expected a claimable job')
    }
    results.push({ stage: 'worker.claim', samples })
  }

  // 5. Processing: deterministic refusal, which never reaches a model.
  {
    const { db } = createExtWorld()
    const samples: number[] = []
    for (let index = 0; index < iterations; index += 1) {
      const eventId = `qr:${EXT_CHANNEL}:refuse-${index}`
      const started = performance.now()
      const result = await processInboundMessage(db, {
        organizationId: EXT_ORG,
        businessId: EXT_BIZ,
        channelId: EXT_CHANNEL,
        channelType: 'whatsapp',
        provider: 'whatsapp_qr',
        externalEventId: eventId,
        externalUserId: `${EXT_FRIEND_PHONE}@s.whatsapp.net`,
        senderPhone: EXT_FRIEND_PHONE,
        displayName: 'سعيد',
        text: OUT_OF_SCOPE_TEXT,
      })
      samples.push(performance.now() - started)
      if (!result.reply) throw new Error('expected a deterministic refusal')
    }
    results.push({ stage: 'process.refuse_no_model', samples })
  }

  // 6–7. Coordination turn with a zero-latency model, then with synthetic model latency.
  for (const [stage, delay, count] of [
    ['process.coordination_model_0ms', 0, iterations],
    [`process.coordination_model_${modelDelayMs}ms`, modelDelayMs, slowIterations],
  ] as const) {
    const { db } = createExtWorld()
    setAgentTurnRunner(async () => {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      return 'سأوصل رسالتك إلى صاحب الحساب.'
    })
    const samples: number[] = []
    for (let index = 0; index < count; index += 1) {
      const started = performance.now()
      await processInboundMessage(db, {
        organizationId: EXT_ORG,
        businessId: EXT_BIZ,
        channelId: EXT_CHANNEL,
        channelType: 'whatsapp',
        provider: 'whatsapp_qr',
        externalEventId: `qr:${EXT_CHANNEL}:${delay}-${index}`,
        externalUserId: `${EXT_FRIEND_PHONE}@s.whatsapp.net`,
        senderPhone: EXT_FRIEND_PHONE,
        displayName: 'سعيد',
        text: COORDINATION_TEXT,
      })
      samples.push(performance.now() - started)
    }
    results.push({ stage, samples })
  }
  setAgentTurnRunner(async () => 'سأوصل رسالتك إلى صاحب الحساب.')

  // 8. Full synthetic pipeline per message: enqueue -> claim -> turn -> reply intent.
  {
    const { db, store } = createExtWorld()
    const samples: number[] = []
    for (let index = 0; index < iterations; index += 1) {
      const eventId = `qr:${EXT_CHANNEL}:pipeline-${index}`
      const started = performance.now()
      await enqueueQrInbound(db, { eventId, text: COORDINATION_TEXT })
      const job = await claimNextJob(db)
      if (!job) throw new Error('expected a queued job')
      const result = await processClaimedJob(db, job)
      samples.push(performance.now() - started)
      if (!result.reply) throw new Error('expected a reply')
      if (result.delivery !== 'queued') throw new Error(`expected a durable reply intent, got ${result.delivery}`)
    }
    if ((store.outbox_events.rows ?? []).length !== iterations) throw new Error('reply intents were duplicated or lost')
    results.push({ stage: 'pipeline.total_no_model', samples })
  }

  // 9. OPS-007 phases: same synthetic pipeline, but each phase timed separately so
  // the measured model and delivery segments are reported as p50/p95. The provider is
  // still the in-memory double, so `outbound_intent_reserve` is a DB reservation, not
  // a network send.
  {
    const { db } = createExtWorld()
    setAgentTurnRunner(async () => {
      if (modelDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, modelDelayMs))
      return 'سأوصل رسالتك إلى صاحب الحساب.'
    })
    const turnSamples: number[] = []
    const modelSamples: number[] = []
    const outboundSamples: number[] = []
    for (let index = 0; index < slowIterations; index += 1) {
      const eventId = `qr:${EXT_CHANNEL}:ops007-${index}`
      await enqueueQrInbound(db, { eventId, text: COORDINATION_TEXT })
      const job = await claimNextJob(db)
      if (!job) throw new Error('expected a queued job')
      const timings: { attempts?: number; modelMs?: number } = { attempts: job.attempts }
      const turnStarted = performance.now()
      const result = await runInboundJobTurn(db, job.payload, {}, timings)
      turnSamples.push(performance.now() - turnStarted)
      if (typeof timings.modelMs === 'number') modelSamples.push(timings.modelMs)
      if (!result.reply) throw new Error('expected a reply')
      const outboundStarted = performance.now()
      const delivery = await deliverOutbound(db, {
        channel: {
          id: EXT_CHANNEL,
          organizationId: EXT_ORG,
          businessId: EXT_BIZ,
          channelType: 'whatsapp',
          connectionMode: 'qr_unofficial',
          providerAccountId: null,
          externalIdentifier: null,
        },
        recipient: EXT_FRIEND_PHONE,
        body: result.reply,
        idempotencyKey: `${eventId}:reply`,
        conversationId: result.conversationId || null,
        senderType: 'ai',
      })
      outboundSamples.push(performance.now() - outboundStarted)
      if (delivery !== 'queued') throw new Error(`expected a durable intent, got ${delivery}`)
    }
    results.push(
      { stage: 'ops007.turn_total', samples: turnSamples },
      { stage: 'ops007.model_duration', samples: modelSamples },
      { stage: 'ops007.outbound_intent_reserve', samples: outboundSamples }
    )
  }

  const refusal = planExternalContactTurn({ text: OUT_OF_SCOPE_TEXT, history: [] })
  const coordination = planExternalContactTurn({ text: COORDINATION_TEXT, history: [] })
  if (refusal.action !== 'refuse' || coordination.action !== 'model') {
    throw new Error('fixture classification changed; re-check the measurement inputs')
  }

  console.log('EXT-005 synthetic latency baseline (in-memory PostgREST double, no provider network)')
  console.log(`iterations=${iterations} slow_model_iterations=${slowIterations} model_delay=${modelDelayMs}ms`)
  console.log(header)
  for (const result of results) console.log(summarize(result))
  console.log('')
  console.log(`queue wait is not measured; bounded by worker poll ${INBOUND_WORKER_POLL_MS}ms and outbox drain ${OUTBOX_DRAIN_INTERVAL_MS}ms`)

  const modelBound = results.find((item) => item.stage === `process.coordination_model_${modelDelayMs}ms`)
  const overhead = results.find((item) => item.stage === 'process.coordination_model_0ms')
  if (modelBound && overhead) {
    const modelP50 = percentile([...modelBound.samples].sort((a, b) => a - b), 50)
    const overheadP50 = percentile([...overhead.samples].sort((a, b) => a - b), 50)
    console.log(`bottleneck attribution: model wait ~${(modelP50 - overheadP50).toFixed(2)} ms of ${modelP50.toFixed(2)} ms p50 coordination turn`)
  }

  setAgentTurnRunner(null)
}

main().catch((error) => {
  console.error('ext_005_measurement_failed', error instanceof Error ? error.message : error)
  process.exit(1)
})
