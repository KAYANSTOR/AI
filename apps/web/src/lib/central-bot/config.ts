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

/** Local configuration readiness for issuing activation links; not a live Meta probe. */
export function getCentralLinkConfig(env: NodeJS.ProcessEnv = process.env): CentralBotConfig | null {
  const config = getCentralBotConfig(env)
  return config && /^[1-9][0-9]{7,14}$/.test(config.displayNumber) ? config : null
}

export function isCentralPhoneNumberId(phoneNumberId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = String(env.KAYAN_CENTRAL_WA_PHONE_NUMBER_ID ?? '').trim()
  return Boolean(configured) && configured === phoneNumberId.trim()
}

export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL ?? 'https://kayan-ai.up.railway.app').replace(/\/+$/, '')
}

/**
 * Optional dedicated trainer number («مدرب كيان»). When unset, training runs as a mode on
 * the central number, so nothing breaks before these variables exist.
 */
export function getTrainerBotConfig(env: NodeJS.ProcessEnv = process.env): CentralBotConfig | null {
  const phoneNumberId = String(env.KAYAN_TRAINER_WA_PHONE_NUMBER_ID ?? '').trim()
  const accessToken = String(env.KAYAN_TRAINER_WA_ACCESS_TOKEN ?? '').trim()
  if (!phoneNumberId || !accessToken) return null
  return {
    phoneNumberId,
    accessToken,
    displayNumber: String(env.KAYAN_TRAINER_WA_DISPLAY_NUMBER ?? '').replace(/\D/g, ''),
    graphBaseUrl: String(env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v26.0').replace(/\/+$/, ''),
  }
}

export function isTrainerPhoneNumberId(phoneNumberId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = String(env.KAYAN_TRAINER_WA_PHONE_NUMBER_ID ?? '').trim()
  return Boolean(configured) && configured === phoneNumberId.trim()
}

/** The number the dashboard «درّب وكيلك عبر واتساب» button opens: dedicated trainer first. */
export function trainerEntryNumber(env: NodeJS.ProcessEnv = process.env): { number: string; mode: 'trainer' | 'central' | 'none' } {
  const trainer = getTrainerBotConfig(env)
  if (trainer?.displayNumber) return { number: trainer.displayNumber, mode: 'trainer' }
  const central = getCentralBotConfig(env)
  const centralNumber = centralDisplayNumber(env)
  if (central && centralNumber) return { number: centralNumber, mode: 'central' }
  return { number: '', mode: 'none' }
}
