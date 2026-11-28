/**
 * OPS-001 — delivery order and forward retry for WhatsApp QR inbound messages.
 *
 * Two guarantees are expressed here so they can be integration-tested against a
 * real HTTP app stub instead of only being visible inside `server.js`:
 *
 * 1. Readiness is written before routing. `createReadinessBarrier` publishes the
 *    barrier synchronously when the socket opens, and every message delivery
 *    awaits it, so the app never receives a message for a channel whose
 *    `verification_status`/`is_active` write is still in flight.
 * 2. A retry can never duplicate a message. The app deduplicates by
 *    `externalEventId`, so a bounded retry after a transient rejection (deploy
 *    overlap, 404 while the readiness write commits) is safe.
 */

export const APP_FORWARD_ATTEMPTS = 5
export const APP_FORWARD_RETRY_DELAYS_MS = [250, 500, 1000, 2000]

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Publishes the readiness barrier synchronously and returns the promise that
 * settles once the channel row is ready. Attaching the catch branch here keeps
 * a failed write from becoming an unhandled rejection before any message
 * arrives; awaiting the returned promise still observes the failure.
 */
export function createReadinessBarrier(write) {
  if (typeof write !== 'function') throw new TypeError('readiness_barrier_requires_write_function')
  const barrier = Promise.resolve().then(write)
  barrier.catch(() => undefined)
  return barrier
}

/**
 * Routes a message only after the readiness barrier settled. A failed barrier is
 * reported to the caller (the connection handler logs it) and delivery continues:
 * the app still enforces readiness, and the forward retry covers a lost write.
 */
export async function deliverAfterReadiness(barrier, deliver) {
  try {
    await barrier
  } catch {
    // The barrier write already logged its own failure; the app-side gate and
    // the retry below remain the authoritative protection.
  }
  return deliver()
}

/**
 * Creates the bounded forwarder to the app. Every non-OK response is classified:
 * transient kinds (readiness not committed yet, deploy overlap, 5xx) are retried,
 * permanent ones (authentication, validation) fail immediately so a bad payload
 * is never replayed.
 */
export function createAppForwarder(options) {
  const {
    appUrl,
    token,
    fetchImpl = fetch,
    sleep = defaultSleep,
    attempts = APP_FORWARD_ATTEMPTS,
    retryDelaysMs = APP_FORWARD_RETRY_DELAYS_MS,
    log = console,
  } = options || {}
  const baseUrl = String(appUrl || '').replace(/\/+$/, '')
  if (!baseUrl) throw new Error('app_forwarder_requires_app_url')
  if (!token) throw new Error('app_forwarder_requires_token')

  return async function postToApp(path, body, logKey, channelId) {
    let lastStatus = 0
    let lastReason = ''
    let usedAttempts = 0
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      usedAttempts = attempt
      try {
        const response = await fetchImpl(baseUrl + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        })
        if (response.ok) return true
        lastStatus = response.status
        lastReason = (await response.text().catch(() => '')).slice(0, 120)
        const retryable = response.status === 404 || response.status === 408 ||
          response.status === 425 || response.status === 429 || response.status >= 500
        if (!retryable || attempt === attempts) break
      } catch (error) {
        lastStatus = 0
        lastReason = error instanceof Error ? error.message : 'network_error'
        if (attempt === attempts) break
      }
      await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)])
    }
    log.error(logKey, { channelId, status: lastStatus, reason: lastReason, attempts: usedAttempts })
    return false
  }
}
