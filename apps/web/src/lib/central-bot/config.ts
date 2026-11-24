/**
 * Central "Kayan AI" WhatsApp bot (one Meta Cloud API number for every subscriber).
 * All variables are optional: when unset the feature stays dormant and nothing in the
 * build or the business-number webhook path changes.
 */
export type CentralBotConfig = {
  phoneNumberId: string
  accessToken: string
  displayNumber: string
  graphBaseUrl: string
}

export function centralDisplayNumber(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.KAYAN_CENTRAL_WA_DISPLAY_NUMBER ?? '').replace(/\D/g, '')
}

export function getCentralBotConfig(env: NodeJS.ProcessEnv = process.env): CentralBotConfig | null {
  const phoneNumberId = String(env.KAYAN_CENTRAL_WA_PHONE_NUMBER_ID ?? '').trim()
  const accessToken = String(env.KAYAN_CENTRAL_WA_ACCESS_TOKEN ?? '').trim()
  if (!phoneNumberId || !accessToken) return null
  return {
    phoneNumberId,
    accessToken,
    displayNumber: centralDisplayNumber(env),
    graphBaseUrl: String(env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v26.0').replace(/\/+$/, ''),
  }
}

export function isCentralPhoneNumberId(phoneNumberId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = String(env.KAYAN_CENTRAL_WA_PHONE_NUMBER_ID ?? '').trim()
  return Boolean(configured) && configured === phoneNumberId.trim()
}

export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL ?? 'https://kayan-ai.up.railway.app').replace(/\/+$/, '')
}
