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
  if (!response.ok) throw new Error('WhatsApp send failed: HTTP ' + response.status)
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
