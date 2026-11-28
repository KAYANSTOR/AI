/**
 * OPS-002 — deterministic startup reconciliation decision for stored QR sessions.
 *
 * The gateway may only restore a session backed by a credential blob whose
 * `registered` flag is true. Anything else must not be reported as connected:
 * the session row is reconciled to `failed` and the channel is deactivated, but
 * credentials and auth keys are preserved so a later pairing attempt or a
 * recovered credential blob can still use them.
 *
 * Kept pure so the decision can be regression-tested without a database.
 */
export function restoreSessionDecision(input) {
  const { hasCredentials, credentialsValid, registered, hasLiveSocket, status } = input

  if (hasLiveSocket) return { action: 'skip_live', reason: 'socket_already_active' }

  if (!hasCredentials) {
    return { action: 'reconcile_unregistered', reason: 'missing_credentials' }
  }
  if (!credentialsValid) {
    return { action: 'reconcile_unregistered', reason: 'invalid_credentials' }
  }
  if (!registered) {
    return { action: 'reconcile_unregistered', reason: 'unregistered_credentials' }
  }
  if (status === 'failed') {
    return { action: 'restore', reason: 'registered_credentials' }
  }
  return { action: 'restore', reason: 'registered_credentials' }
}

/**
 * A channel is shown as connected only when the gateway holds a live socket for
 * it; the database row alone is not evidence of a working WhatsApp session.
 */
export function sessionIsConnected(status, hasLiveSocket) {
  return hasLiveSocket === true && status === 'connected'
}
