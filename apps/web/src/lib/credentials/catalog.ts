/**
 * Credential catalogue — client-safe.
 *
 * This module must stay free of `node:crypto` (and of anything else server-only) because
 * the dashboard renders it. The crypto and storage lives in `service.ts`, which server
 * components and server actions import; a client component importing a runtime value
 * from there would pull Node builtins into the browser bundle.
 */
import type { ChannelType } from '@/lib/channels/management'

/** Name of the server-only key used to encrypt provider credentials. */
export const CREDENTIAL_KEY_ENV = 'CREDENTIAL_ENCRYPTION_KEY'

export type CredentialField = {
  type: string
  label: string
  secret: boolean
  required: boolean
  hint?: string
}

export const PROVIDER_FOR_CHANNEL: Record<ChannelType, string> = {
  whatsapp: 'meta',
  instagram: 'meta',
  sms: 'twilio',
  phone: 'vapi',
}

export const CHANNEL_CREDENTIAL_FIELDS: Record<ChannelType, readonly CredentialField[]> = {
  whatsapp: [
    { type: 'access_token', label: 'Access Token', secret: true, required: true },
    { type: 'phone_number_id', label: 'Phone Number ID', secret: false, required: false },
    { type: 'app_secret', label: 'App Secret', secret: true, required: false, hint: 'للتحقق من توقيع Webhook' },
    { type: 'verify_token', label: 'Verify Token', secret: true, required: false },
  ],
  instagram: [
    { type: 'access_token', label: 'Access Token', secret: true, required: true },
    { type: 'app_secret', label: 'App Secret', secret: true, required: false, hint: 'للتحقق من توقيع Webhook' },
    { type: 'verify_token', label: 'Verify Token', secret: true, required: false },
  ],
  sms: [
    { type: 'account_sid', label: 'Account SID', secret: false, required: true },
    { type: 'auth_token', label: 'Auth Token', secret: true, required: true },
  ],
  phone: [
    { type: 'api_key', label: 'Vapi API Key', secret: true, required: true },
    { type: 'webhook_secret', label: 'Vapi Webhook Secret', secret: true, required: true },
  ],
}

/** Metadata projection of a stored credential — never includes the value. */
export type CredentialMetadata = {
  id: string
  channel_id: string | null
  provider: string
  credential_type: string
  status: string | null
  key_version: number
  last_verified_at: string | null
  expires_at: string | null
  updated_at: string | null
}

export function isCredentialField(channelType: ChannelType, credentialType: string): boolean {
  return CHANNEL_CREDENTIAL_FIELDS[channelType].some((field) => field.type === credentialType)
}
