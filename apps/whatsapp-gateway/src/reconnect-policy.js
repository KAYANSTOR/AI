const MAX_RECONNECT_ATTEMPTS = 5

export function shouldReconnectAfterDisconnect({ code, retries, maxAttempts = MAX_RECONNECT_ATTEMPTS }) {
  if (code === 401) return false
  return Number.isFinite(retries) && retries < maxAttempts
}
