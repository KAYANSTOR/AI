/**
 * Meta Embedded Signup — server side (Tech Provider path).
 *
 * After the customer completes the Facebook popup:
 *   1. Exchange the returned code for a business token.
 *   2. Subscribe our app to the customer's WABA webhooks.
 *   3. Register the phone number for Cloud API (best-effort).
 *   4. Persist the channel as verified + encrypted credentials.
 *
 * All Graph calls are server-to-server. Nothing secret reaches the browser.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { saveChannelCredential } from '@/lib/credentials/service'
import { normalizeChannelNumber } from '@/lib/channels/management'

const GRAPH_VERSION = 'v21.0'

function graphBase(): string {
  const configured = process.env.META_GRAPH_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return `https://graph.facebook.com/${GRAPH_VERSION}`
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export type EmbeddedSignupSession = {
  code: string
  phoneNumberId: string
  wabaId: string
  businessPortfolioId?: string | null
  /** Optional display number if the client already knows it. */
  displayPhoneNumber?: string | null
}

export type EmbeddedSignupResult =
  | {
      ok: true
      phoneNumberId: string
      wabaId: string
      displayNumber: string | null
      message: string
    }
  | { ok: false; error: string }

/** Exchange the short-lived code from FB.login for a business integration token. */
async function exchangeCodeForBusinessToken(code: string): Promise<string> {
  const appId = requireEnv('NEXT_PUBLIC_META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const url = new URL(`${graphBase()}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)

  const response = await fetch(url.toString(), { method: 'GET' })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('EmbeddedSignup: code exchange failed', response.status, body)
    throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
  }

  // Meta may return either a plain token string or a JSON object.
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return json.access_token
  }

  const text = (await response.text()).trim()
  if (!text) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
  // Some responses are form-encoded: access_token=...
  if (text.startsWith('{')) {
    const json = JSON.parse(text) as { access_token?: string }
    if (!json.access_token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return json.access_token
  }
  if (text.includes('access_token=')) {
    const params = new URLSearchParams(text)
    const token = params.get('access_token')
    if (!token) throw new Error('تعذّر إتمام الربط مع Meta. حاول مرة أخرى.')
    return token
  }
  return text
}

async function subscribeAppToWaba(wabaId: string, businessToken: string): Promise<void> {
  const response = await fetch(`${graphBase()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${businessToken}` },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('EmbeddedSignup: subscribe_apps failed', response.status, body)
    // Non-fatal for first connect; webhooks can be fixed later.
  }
}

async function registerPhoneNumber(phoneNumberId: string, businessToken: string): Promise<void> {
  // 6-digit PIN required by the Register API. We generate a random one; the customer
  // can change two-step verification later in WhatsApp Manager.
  const pin = String(Math.floor(100000 + Math.random() * 900000))
  const response = await fetch(`${graphBase()}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${businessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // Already registered is common and acceptable.
    console.warn('EmbeddedSignup: register phone returned', response.status, body)
  }
}

async function fetchDisplayPhoneNumber(
  phoneNumberId: string,
  businessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${graphBase()}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${businessToken}` } }
    )
    if (!response.ok) return null
    const json = (await response.json()) as { display_phone_number?: string }
    return json.display_phone_number ?? null
  } catch {
    return null
  }
}

/**
 * Completes onboarding after Embedded Signup returns session data + code.
 * Idempotent for the same organization + phone_number_id.
 */
export async function completeEmbeddedSignup(input: {
  organizationId: string
  businessId: string | null
  session: EmbeddedSignupSession
}): Promise<EmbeddedSignupResult> {
  const { code, phoneNumberId, wabaId } = input.session
  if (!code || !phoneNumberId || !wabaId) {
    return { ok: false, error: 'بيانات الربط من Meta غير مكتملة. حاول مرة أخرى.' }
  }

  try {
    const businessToken = await exchangeCodeForBusinessToken(code)

    // Parallel non-blocking steps.
    await Promise.all([
      subscribeAppToWaba(wabaId, businessToken),
      registerPhoneNumber(phoneNumberId, businessToken),
    ])

    const displayFromApi = await fetchDisplayPhoneNumber(phoneNumberId, businessToken)
    const displayNumber =
      displayFromApi ??
      (input.session.displayPhoneNumber
        ? normalizeChannelNumber(input.session.displayPhoneNumber)
        : null)

    const admin = createAdminClient()

    const { data: existing } = await admin
      .from('channels')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

    const patch = {
      ...(input.businessId ? { business_id: input.businessId } : {}),
      provider_account_id: phoneNumberId,
      external_identifier: displayNumber,
      verification_status: 'verified',
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    const written = existing
      ? await admin.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await admin
          .from('channels')
          .insert({
            organization_id: input.organizationId,
            channel_type: 'whatsapp',
            ...patch,
          })
          .select('id')
          .single()

    if (written.error || !written.data) {
      console.error('EmbeddedSignup: failed to save channel', written.error)
      return { ok: false, error: 'تعذّر حفظ قناة واتساب. حاول مرة أخرى.' }
    }

    const channelId = written.data.id as string

    // Store credentials encrypted per-channel (access_token + waba + phone_number_id).
    await Promise.all([
      saveChannelCredential(admin, {
        organizationId: input.organizationId,
        channelId,
        provider: 'meta',
        credentialType: 'access_token',
        value: businessToken,
      }),
      saveChannelCredential(admin, {
        organizationId: input.organizationId,
        channelId,
        provider: 'meta',
        credentialType: 'business_account_id',
        value: wabaId,
      }),
      saveChannelCredential(admin, {
        organizationId: input.organizationId,
        channelId,
        provider: 'meta',
        credentialType: 'phone_number_id',
        value: phoneNumberId,
      }),
    ])

    // Keep public phone in sync when we learned a display number.
    if (displayNumber) {
      await admin
        .from('business_profiles')
        .update({ public_phone_number: displayNumber, updated_at: new Date().toISOString() })
        .eq('organization_id', input.organizationId)
    }

    return {
      ok: true,
      phoneNumberId,
      wabaId,
      displayNumber,
      message: 'تم ربط واتساب بنجاح. الرقم جاهز لاستقبال العملاء.',
    }
  } catch (error) {
    console.error('EmbeddedSignup: complete failed', error)
    const message =
      error instanceof Error && error.message.startsWith('تعذّر')
        ? error.message
        : 'تعذّر إتمام ربط واتساب. حاول مرة أخرى.'
    return { ok: false, error: message }
  }
}

/** True when the public env needed to launch the popup is present. */
export function isEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
