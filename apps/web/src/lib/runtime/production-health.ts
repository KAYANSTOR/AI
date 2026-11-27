import { getCentralLinkConfig } from '../central-bot/config'

type HealthFetch = (url: string, init: RequestInit) => Promise<Response>

/** Gateway's /health performs SELECT 1; it is bound to loopback by the supervisor. */
export async function readProductionHealth(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: HealthFetch = fetch,
) {
  const centralConfigured = getCentralLinkConfig(env) !== null
  const central = {
    status: centralConfigured ? 'configured' : 'unconfigured',
    message: centralConfigured ? 'إعدادات ربط المساعد المركزي متوفرة.' : 'المساعد المركزي غير مهيأ. يمكنك متابعة استخدام الموقع.',
  }
  const port = Number(env.WHATSAPP_GATEWAY_PORT || 3001)
  let gatewayReady = false
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const result = await response.json() as { ok?: boolean; service?: string }
        gatewayReady = result?.ok === true && result.service === 'whatsapp-gateway'
      }
    } catch {
      // Do not disclose upstream errors, addresses or credential values.
      console.warn('production_gateway_health_unavailable')
    }
  }
  return {
    ok: gatewayReady,
    status: gatewayReady ? 'ready' : 'unavailable',
    message: gatewayReady ? 'التطبيق وبوابة واتساب جاهزان.' : 'خدمة واتساب أو قاعدة البيانات غير متاحة مؤقتاً.',
    central,
  }
}
