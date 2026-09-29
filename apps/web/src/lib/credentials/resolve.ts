/**
 * Resolution policy for provider credentials.
 *
 * Per-channel credentials are authoritative. The platform-level environment variables
 * still exist for operators running a single-tenant/self-hosted deployment, but the
 * fallback is no longer implicit: it only applies when PLATFORM_PROVIDER_CREDENTIALS=true.
 * With the flag off (the default), a channel without its own credentials fails closed
 * instead of silently sending one business's traffic with another business's token.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PROVIDER_FOR_CHANNEL, loadChannelCredentials } from '@/lib/credentials/service'
import type { ChannelType } from '@/lib/channels/management'

export const PLATFORM_CREDENTIALS_ENV = 'PLATFORM_PROVIDER_CREDENTIALS'

export function platformCredentialsEnabled(): boolean {
  return process.env[PLATFORM_CREDENTIALS_ENV]?.trim().toLowerCase() === 'true'
}

export type CredentialTarget = { channelId: string; channelType: string }

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/**
 * Operator-managed fallback, only consulted when PLATFORM_PROVIDER_CREDENTIALS=true.
 * Kept in one place so no provider reads configuration on its own.
 */
export function platformCredentials(channelType: ChannelType): Record<string, string> {
  if (!platformCredentialsEnabled()) return {}

  if (channelType === 'whatsapp' || channelType === 'instagram') {
    return compact({
      access_token: channelType === 'whatsapp' ? env('WHATSAPP_ACCESS_TOKEN') : env('INSTAGRAM_ACCESS_TOKEN'),
      app_secret: env('META_APP_SECRET') ?? env('WHATSAPP_APP_SECRET'),
      verify_token: channelType === 'whatsapp' ? env('WHATSAPP_VERIFY_TOKEN') : env('INSTAGRAM_VERIFY_TOKEN'),
    })
  }
  if (channelType === 'sms') {
    return compact({ account_sid: env('TWILIO_ACCOUNT_SID'), auth_token: env('TWILIO_AUTH_TOKEN') })
  }
  if (channelType === 'phone') {
    return compact({ api_key: env('VAPI_API_KEY'), webhook_secret: env('VAPI_WEBHOOK_SECRET') })
  }
  return {}
}

function compact(source: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value) result[key] = value
  }
  return result
}

/**
 * The credentials a channel should send with. Returns {} when nothing is configured,
 * so callers can decide between failing closed and reporting a setup gap.
 *
 * Stored per-channel values win over the operator fallback, so a tenant can override
 * just the parts it owns (for example its own app secret) and nothing else.
 */
export async function resolveChannelProviderCredentials(
  supabase: SupabaseClient,
  channel: CredentialTarget
): Promise<Record<string, string>> {
  const channelType = channel.channelType as ChannelType
  const provider = PROVIDER_FOR_CHANNEL[channelType]
  if (!provider) return {}

  const stored = await loadChannelCredentials(supabase, channel.channelId)
  return { ...platformCredentials(channelType), ...stored, __provider: provider }
}
