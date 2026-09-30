/**
 * Kayan Connect — the shared vocabulary of a channel connection.
 *
 * This module stays free of server-only imports (no node:crypto, no Supabase service) so
 * the client components that render connection state can import it. The provider calls and
 * storage live in connect-service.ts.
 *
 * The rule this file exists to enforce: a customer never copies a provider identifier.
 * The only thing a customer supplies is their own public number; the provider identifier is
 * resolved by the platform or stays unknown and is shown as "قيد التحقق".
 */

export type ChannelConnectionState =
  | 'not_connected'
  | 'pending'
  | 'verified'
  | 'disabled'
  | 'error'

export type ChannelRowLike = {
  verification_status: string | null
  is_active: boolean | null
}

/**
 * Maps the stored channel row onto the state a person sees. `verification_status` is the
 * provider's answer; `is_active` is the tenant's switch; both matter, so the combination —
 * not either column alone — decides the state.
 */
export function describeChannelState(row: ChannelRowLike | null | undefined): ChannelConnectionState {
  if (!row) return 'not_connected'
  if (row.is_active === false || row.verification_status === 'disabled') return 'disabled'
  if (row.verification_status === 'verified') return 'verified'
  if (row.verification_status === 'failed') return 'error'
  return 'pending'
}

export const CONNECTION_STATE_LABELS: Record<ChannelConnectionState, string> = {
  not_connected: 'غير مربوط',
  pending: 'قيد التحقق',
  verified: 'مربوط',
  disabled: 'متوقف',
  error: 'يحتاج إعادة محاولة',
}

/** The platform's WhatsApp Business Account, used only to resolve a number to its id. */
export const WHATSAPP_WABA_ENV = 'WHATSAPP_BUSINESS_ACCOUNT_ID'

/** Digits only, so +967 777 123 456 and 00967777123456 compare as the same number. */
export function phoneDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '')
}

export function isPlausiblePhoneNumber(value: string): boolean {
  const digits = phoneDigits(value)
  return digits.length >= 8 && digits.length <= 15
}

export type WhatsAppLookupResult =
  | { ok: true; phoneNumberId: string; displayNumber: string | null }
  | { ok: false; reason: 'not_found' | 'provider_error'; detail?: string }

/**
 * Resolves the provider's phone_number_id from the customer's own number.
 *
 * This is what replaces "انسخ phone_number_id": the platform holds the WhatsApp Business
 * Account token, lists the numbers on that account, and matches the one the customer
 * entered. When nothing matches, the caller records the number as pending rather than
 * inventing a binding.
 */
export async function lookupWhatsAppPhoneNumberId(input: {
  accessToken: string
  businessAccountId: string
  number: string
  baseUrl: string
  fetcher?: typeof fetch
}): Promise<WhatsAppLookupResult> {
  const target = phoneDigits(input.number)
  const url =
    input.baseUrl.replace(/\/+$/, '') +
    '/' +
    encodeURIComponent(input.businessAccountId) +
    '/phone_numbers?fields=id,display_phone_number,verified_name&limit=200'

  const fetcher = input.fetcher ?? fetch
  let response: Response
  try {
    response = await fetcher(url, { headers: { Authorization: 'Bearer ' + input.accessToken } })
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_error',
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  if (!response.ok) {
    return { ok: false, reason: 'provider_error', detail: 'HTTP ' + response.status }
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: { id?: string; display_phone_number?: string }[] }
    | null

  const match = (payload?.data ?? []).find(
    (entry) => phoneDigits(entry.display_phone_number ?? '') === target
  )

  if (!match?.id) return { ok: false, reason: 'not_found' }
  return { ok: true, phoneNumberId: String(match.id), displayNumber: match.display_phone_number ?? null }
}
