/**
 * Provider-neutral channel contracts.
 *
 * These contracts describe persisted channel identities and connection modes.
 * They do not imply that a provider is operational: a channel must not be shown as
 * connected until its provider lifecycle and end-to-end checks are implemented.
 */

export type ProviderChannelType =
  | 'whatsapp'
  | 'instagram'
  | 'sms'
  | 'phone'
  | 'website'
  | 'email'
  | 'telegram'
  | 'messenger'

export type WhatsAppConnectionMode =
  | 'cloud_api'
  | 'coexistence'
  | 'qr_unofficial'

export type ChannelConnectionMode = WhatsAppConnectionMode | 'native'

/** All channel types accepted by the persisted channels schema. */
export const PROVIDER_CHANNEL_TYPES: readonly ProviderChannelType[] = [
  'phone',
  'whatsapp',
  'instagram',
  'sms',
  'website',
  'email',
  'telegram',
  'messenger',
]

export function isProviderChannelType(value: unknown): value is ProviderChannelType {
  return typeof value === 'string' && (PROVIDER_CHANNEL_TYPES as readonly string[]).includes(value)
}

export type ChannelCredentialContract = {
  provider: 'meta' | 'telegram' | 'website' | 'twilio' | 'vapi' | 'whatsapp_web'
  credentialTypes: readonly string[]
  secretsMustBeEncrypted: true
}

export const CHANNEL_CREDENTIAL_CONTRACTS: Partial<
  Record<ProviderChannelType, ChannelCredentialContract>
> = {
  whatsapp: {
    provider: 'meta',
    credentialTypes: ['access_token', 'business_account_id', 'phone_number_id', 'app_secret', 'verify_token'],
    secretsMustBeEncrypted: true,
  },
  instagram: {
    provider: 'meta',
    credentialTypes: ['access_token', 'app_secret', 'verify_token'],
    secretsMustBeEncrypted: true,
  },
  telegram: {
    provider: 'telegram',
    credentialTypes: ['bot_token', 'webhook_secret'],
    secretsMustBeEncrypted: true,
  },
  messenger: {
    provider: 'meta',
    credentialTypes: ['page_access_token', 'app_secret', 'verify_token'],
    secretsMustBeEncrypted: true,
  },
  website: {
    provider: 'website',
    credentialTypes: ['widget_signing_secret'],
    secretsMustBeEncrypted: true,
  },
}

/**
 * WhatsApp QR is deliberately not stored under the Meta provider credentials.
 * Its long-lived session material uses a separate provider namespace and must be
 * encrypted independently from Cloud API / Coexistence access tokens.
 */
export const WHATSAPP_QR_SESSION_CREDENTIAL: ChannelCredentialContract = {
  provider: 'whatsapp_web',
  credentialTypes: ['session_data'],
  secretsMustBeEncrypted: true,
}

export type WebsiteChatWidgetContract = {
  /** Public identifier only; never an authentication secret. */
  publicKey: string
  /** Exact allowed browser origins, normalized to scheme + host + optional port. */
  allowedOrigins: readonly string[]
  /** Server-side secret is stored only in provider_credentials. */
  signingSecretCredential: 'widget_signing_secret'
  /** New conversations are always resolved inside the owning organization. */
  tenantScoped: true
}

export const WHATSAPP_CONNECTION_MODES: readonly {
  value: WhatsAppConnectionMode
  official: boolean
  requiresMetaEmbeddedSignup: boolean
}[] = [
  { value: 'cloud_api', official: true, requiresMetaEmbeddedSignup: true },
  { value: 'coexistence', official: true, requiresMetaEmbeddedSignup: true },
  { value: 'qr_unofficial', official: false, requiresMetaEmbeddedSignup: false },
]

export function isWhatsAppConnectionMode(value: unknown): value is WhatsAppConnectionMode {
  return typeof value === 'string' && WHATSAPP_CONNECTION_MODES.some((mode) => mode.value === value)
}

export function isChannelConnectionMode(value: unknown): value is ChannelConnectionMode {
  return value === 'native' || isWhatsAppConnectionMode(value)
}
