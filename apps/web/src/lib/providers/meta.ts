/**
 * Meta (WhatsApp / Instagram) outbound adapter.
 *
 * Credentials are passed in explicitly by the caller, which resolves them per channel
 * through CredentialService. This module never reads a provider token from the
 * environment itself, so a per-tenant token cannot be silently replaced by a global one.
 */
export type MetaMessageCredentials = {
  access_token: string
  /** Present for WhatsApp; the phone_number_id to send from. */
  phone_number_id?: string
  /** Present for Instagram; the account id to send from. */
  account_id?: string
}

function requireGraphBase() {
  const value = process.env.META_GRAPH_BASE_URL
  if (!value) throw new Error('META_GRAPH_BASE_URL is required')
  return value.replace(/\/+$/, '')
}


export type WhatsAppTemplateInput = {
  name: string
  languageCode: string
  bodyParameters?: string[]
}

export class MetaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'MetaApiError'
  }
}

export function buildWhatsAppTemplatePayload(to: string, template: WhatsAppTemplateInput) {
  const parameters = (template.bodyParameters ?? []).map((text) => ({ type: 'text' as const, text }))
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.languageCode },
      ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}),
    },
  }
}

export async function sendWhatsAppTemplate(
  credentials: MetaMessageCredentials,
  to: string,
  template: WhatsAppTemplateInput
): Promise<{ messageId: string | null }> {
  if (!credentials.access_token) throw new Error('بيانات اعتماد Meta غير مكتملة: Access Token.')
  if (!credentials.phone_number_id) throw new Error('معرّف رقم واتساب غير مكتمل. أعد فحص ربط القناة.')

  const response = await fetch(
    requireGraphBase() + '/' + encodeURIComponent(credentials.phone_number_id) + '/messages',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + credentials.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildWhatsAppTemplatePayload(to, template)),
    }
  )

  const payload = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>
        error?: { message?: string; error_user_title?: string; error_user_msg?: string; code?: number }
      }
    | null

  if (!response.ok) {
    const detail = payload?.error?.error_user_msg || payload?.error?.error_user_title || payload?.error?.message
    const code = typeof payload?.error?.code === 'number' ? ' (رمز Meta ' + payload.error.code + ')' : ''
    throw new MetaApiError(
      'رفضت Meta إرسال قالب WhatsApp (HTTP ' + response.status + ')' + code +
        (detail ? '. ' + detail : '. تحقق من اسم القالب ولغته وصلاحية رقم الاختبار.'),
      response.status
    )
  }

  return { messageId: payload?.messages?.[0]?.id ?? null }
}

export async function sendWhatsAppText(
  credentials: MetaMessageCredentials,
  to: string,
  body: string
): Promise<void> {
  if (!credentials.access_token) throw new Error('WhatsApp access_token is required')
  if (!credentials.phone_number_id) throw new Error('WhatsApp phone_number_id is required')

  const response = await fetch(
    requireGraphBase() + '/' + encodeURIComponent(credentials.phone_number_id) + '/messages',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + credentials.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    }
  )
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string; error_user_title?: string; error_user_msg?: string; code?: number } }
      | null
    const detail = payload?.error?.error_user_msg || payload?.error?.error_user_title || payload?.error?.message
    const code = typeof payload?.error?.code === 'number' ? ' (رمز Meta ' + payload.error.code + ')' : ''
    throw new MetaApiError(
      'رفضت Meta إرسال الرسالة (HTTP ' + response.status + ')' + code +
        (detail ? '. ' + detail : '. تحقق من صلاحية نافذة المحادثة والرقم المستلم.'),
      response.status
    )
  }
}

export async function sendInstagramText(
  credentials: MetaMessageCredentials,
  recipientId: string,
  body: string
): Promise<void> {
  if (!credentials.access_token) throw new Error('Instagram access_token is required')
  if (!credentials.account_id) throw new Error('Instagram account_id is required')

  const response = await fetch(
    requireGraphBase() + '/' + encodeURIComponent(credentials.account_id) + '/messages',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + credentials.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: body } }),
    }
  )
  if (!response.ok) throw new Error('Instagram send failed: HTTP ' + response.status)
}
