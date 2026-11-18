export type MetaEmbeddedSignupSession = {
  phoneNumberId: string | null
  wabaId: string | null
  businessPortfolioId: string | null
  isOnBusinessApp: boolean
  primaryWaacIds: string[]
}

export type ParsedMetaEmbeddedSignupEvent =
  | { kind: 'finish'; session: MetaEmbeddedSignupSession }
  | { kind: 'cancel'; currentStep: string | null }
  | { kind: 'error'; message: string; code: string | null }
  | { kind: 'ignore' }

const META_ID_PATTERN = /^\d{5,64}$/

/** Trust only HTTPS pages served from Meta-owned Facebook domains. */
export function isTrustedMetaEmbeddedSignupOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
    )
  } catch {
    return false
  }
}

function metaId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return META_ID_PATTERN.test(id) ? id : null
}

function firstMetaId(value: unknown): string | null {
  if (typeof value === 'string') return metaId(value)
  if (!Array.isArray(value)) return null
  for (const candidate of value) {
    const id = metaId(candidate)
    if (id) return id
  }
  return null
}

/**
 * Parses the versioned WA_EMBEDDED_SIGNUP postMessage event.
 *
 * v5 returns messaging_account_ids (rather than only waba_id) and identifies
 * WhatsApp Business App onboarding with is_on_biz_app. Older WABA fields are
 * still accepted so already-open sessions and the mobile callback remain safe.
 */
export function parseMetaEmbeddedSignupEvent(
  origin: string,
  raw: unknown
): ParsedMetaEmbeddedSignupEvent {
  if (!isTrustedMetaEmbeddedSignupOrigin(origin)) return { kind: 'ignore' }

  let message: unknown = raw
  if (typeof raw === 'string') {
    try {
      message = JSON.parse(raw)
    } catch {
      return { kind: 'ignore' }
    }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { kind: 'ignore' }
  }

  const record = message as Record<string, unknown>
  if (record.type !== 'WA_EMBEDDED_SIGNUP') return { kind: 'ignore' }

  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}

  if (record.event === 'CANCEL') {
    return {
      kind: 'cancel',
      currentStep: typeof data.current_step === 'string' ? data.current_step.slice(0, 120) : null,
    }
  }

  if (record.event === 'ERROR') {
    return {
      kind: 'error',
      message:
        (typeof data.error_message === 'string' && data.error_message.trim()) ||
        'Meta could not complete WhatsApp onboarding.',
      code:
        typeof data.error_code === 'string' || typeof data.error_code === 'number'
          ? String(data.error_code).slice(0, 80)
          : null,
    }
  }

  if (
    record.event !== 'FINISH' &&
    record.event !== 'FINISH_ONLY_WABA' &&
    record.event !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  ) {
    return { kind: 'ignore' }
  }

  const messagingAccountId = firstMetaId(data.messaging_account_ids)
  const wabaId = metaId(data.waba_id) ?? messagingAccountId
  const phoneNumberId = metaId(data.phone_number_id)
  const businessPortfolioId = metaId(data.business_id)
  const primaryWaacIds = Array.isArray(data.primary_waac_ids)
    ? data.primary_waac_ids.map(metaId).filter((id): id is string => Boolean(id))
    : []

  return {
    kind: 'finish',
    session: {
      phoneNumberId,
      wabaId,
      businessPortfolioId,
      isOnBusinessApp:
        record.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
        data.is_on_biz_app === true,
      primaryWaacIds,
    },
  }
}
