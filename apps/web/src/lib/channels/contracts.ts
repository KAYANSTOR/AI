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

export type ChannelCredentialContract = {
  provider: 'meta' | 'telegram' | 'website' | 'twilio' | 'vapi'
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
