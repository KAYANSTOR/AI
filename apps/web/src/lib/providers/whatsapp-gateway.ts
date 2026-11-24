export type WhatsAppGatewaySession = {
  status: string
  phoneNumber?: string | null
  qrDataUrl?: string | null
  pairingCode?: string | null
  connectedAt?: string | null
  lastError?: string | null
}
export function gatewayConfiguration() {
  // The gateway runs in the same Railway container (start-with-gateway.mjs) and
  // listens on loopback, so the internal URL is a safe default when unset.
  const baseUrl = (process.env.WHATSAPP_GATEWAY_URL?.trim() || 'http://127.0.0.1:' + (process.env.WHATSAPP_GATEWAY_PORT?.trim() || '3001')).replace(/\/+$/, '')
  const token = process.env.WHATSAPP_GATEWAY_TOKEN?.trim()
  if (!baseUrl || !token) throw new Error('خدمة ربط واتساب QR غير مهيأة على Railway بعد.')
  return { baseUrl, token }
}
export async function callWhatsAppGateway<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { baseUrl, token } = gatewayConfiguration()
  const response = await fetch(baseUrl + path, {
    method,
    headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !payload) {
    const code = typeof payload?.error === 'string' ? payload.error : 'gateway_http_' + response.status
    throw new Error(code)
  }
  return payload as T
}
