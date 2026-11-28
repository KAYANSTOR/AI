import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import http from 'node:http'
import { createAppForwarder, createReadinessBarrier, deliverAfterReadiness } from '../src/inbound-delivery.js'

/**
 * OPS-001 integration test.
 *
 * Runs the real gateway delivery path (readiness barrier + app forwarder over
 * HTTP) against an app stub that reproduces the contract of
 * `POST /api/whatsapp/qr/inbound`:
 *
 * - it answers 404 `channel_unavailable` unless the channel row is
 *   `verification_status='verified'` and `is_active=true`, exactly like
 *   `evaluateQrChannelReadiness`;
 * - it deduplicates by `externalEventId`, exactly like `acquireWebhookEvent`,
 *   so a replayed delivery returns `{ ok: true, duplicate: true }` instead of a
 *   second inbound job.
 *
 * The assertions therefore cover the two guarantees OPS-001 needs: readiness is
 * committed before anything is routed, and a retry never duplicates a message.
 */

const CHANNEL_ID = '11111111-2222-4333-8444-555555555555'
const GATEWAY_TOKEN = 'integration-test-gateway-token'
const INBOUND_PATH = '/api/whatsapp/qr/inbound'
const READY = { verification_status: 'verified', is_active: true }
const PENDING = { verification_status: 'pending', is_active: false }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function createAppStub() {
  const state = {
    channel: { ...PENDING },
    channelReadyAt: 0,
    jobs: new Map(),
    requests: [],
  }
  const server = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    let body = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
    const ready = state.channel.verification_status === 'verified' && state.channel.is_active === true
    const respond = (status, payload) => {
      state.requests.push({ at: Date.now(), eventId: body.externalEventId ?? null, ready, status })
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
    }
    if (request.method !== 'POST' || request.url !== INBOUND_PATH) return respond(404, { error: 'not_found' })
    const authorization = request.headers.authorization ?? ''
    if (authorization !== 'Bearer ' + GATEWAY_TOKEN) return respond(401, { error: 'unauthorized' })
    if (!ready) return respond(404, { error: 'channel_unavailable' })
    if (state.jobs.has(body.externalEventId)) return respond(200, { ok: true, duplicate: true })
    state.jobs.set(body.externalEventId, body)
    return respond(200, { ok: true })
  })
  return { state, server }
}

describe('WhatsApp gateway inbound delivery (OPS-001)', () => {
  let stub
  let forwarder
  let errors

  before(async () => {
    stub = createAppStub()
    await new Promise(resolve => stub.server.listen(0, '127.0.0.1', resolve))
    const { port } = stub.server.address()
    errors = []
    forwarder = createAppForwarder({
      appUrl: 'http://127.0.0.1:' + port,
      token: GATEWAY_TOKEN,
      retryDelaysMs: [40, 40],
      log: { error: (key, detail) => errors.push({ key, detail }) },
    })
  })

  after(async () => {
    await new Promise(resolve => stub.server.close(resolve))
  })

  test('writes channel readiness before routing the message', async () => {
    const { state } = stub
    state.channel = { ...PENDING }
    state.channelReadyAt = 0
    state.requests.length = 0
    state.jobs.clear()

    // The `open` handler publishes the barrier synchronously and settles it after
    // the session row and the channel row have been written.
    const barrier = createReadinessBarrier(async () => {
      await sleep(20) // session status write
      await sleep(50) // channel readiness write
      state.channel = { ...READY }
      state.channelReadyAt = Date.now()
    })

    // A WhatsApp upsert arriving while those writes are still in flight.
    const delivered = await deliverAfterReadiness(barrier, () =>
      forwarder(INBOUND_PATH, { channelId: CHANNEL_ID, externalEventId: 'qr:' + CHANNEL_ID + ':A1' }, 'inbound_forward_failed', CHANNEL_ID))

    assert.equal(delivered, true)
    assert.equal(state.requests.length, 1, 'the barrier must hold the message, not retry it')
    assert.equal(state.requests[0].status, 200)
    assert.equal(state.requests[0].ready, true)
    assert.ok(state.requests[0].at >= state.channelReadyAt, 'the app saw the message only after readiness committed')
    assert.equal(state.jobs.size, 1)
    assert.equal(errors.length, 0)
  })

  test('retries a transient channel_unavailable without duplicating the message', async () => {
    const { state } = stub
    state.channel = { ...PENDING }
    state.requests.length = 0
    state.jobs.clear()

    // Deploy overlap: the app still reports the channel unavailable for the first
    // attempt even though the readiness write is already committed on the way.
    setTimeout(() => { state.channel = { ...READY } }, 60)

    const eventId = 'qr:' + CHANNEL_ID + ':B2'
    const delivered = await forwarder(INBOUND_PATH, { channelId: CHANNEL_ID, externalEventId: eventId }, 'inbound_forward_failed', CHANNEL_ID)

    assert.equal(delivered, true)
    assert.ok(state.requests.length >= 2, 'the transient rejection must be retried')
    assert.equal(state.requests[0].status, 404)
    assert.equal(state.requests.at(-1).status, 200)
    assert.equal(state.requests.filter(request => request.status === 200).length, 1)
    assert.equal(state.jobs.size, 1, 'a retry must produce exactly one inbound job')
    assert.equal(state.jobs.get(eventId).channelId, CHANNEL_ID)

    // WhatsApp redelivering the same provider message is a duplicate, not a new job.
    const replayed = await forwarder(INBOUND_PATH, { channelId: CHANNEL_ID, externalEventId: eventId }, 'inbound_forward_failed', CHANNEL_ID)
    assert.equal(replayed, true)
    assert.equal(state.requests.at(-1).status, 200)
    assert.equal(state.jobs.size, 1, 'a replayed delivery must not create a second job')
  })

  test('gives up after the bounded retry window and logs the loss', async () => {
    const { state } = stub
    state.channel = { ...PENDING }
    state.requests.length = 0
    state.jobs.clear()
    errors.length = 0

    const delivered = await forwarder(INBOUND_PATH, { channelId: CHANNEL_ID, externalEventId: 'qr:' + CHANNEL_ID + ':C3' }, 'whatsapp_qr_inbound_forward_failed', CHANNEL_ID)

    assert.equal(delivered, false)
    assert.equal(state.requests.length, 5)
    assert.ok(state.requests.every(request => request.status === 404))
    assert.equal(state.jobs.size, 0)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].key, 'whatsapp_qr_inbound_forward_failed')
    assert.equal(errors[0].detail.status, 404)
    assert.equal(errors[0].detail.reason.includes('channel_unavailable'), true)
    assert.equal(errors[0].detail.attempts, 5)
  })
})
