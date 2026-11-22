export type EsaalatWallet = {
  id: string
  name: string
  account_number?: string
  currency?: string
  provider?: {
    name?: string
    display_name?: string
  }
}

type EsaalatIntent = {
  id?: string
  pay_url?: string
  expires_at?: string
}

const API_BASE = 'https://api.esaalat.com/api/v1/merchant'
let tokenCache: { token: string; expiresAt: number } | null = null

export function convertUsdToYer(amountUsd: number, yerPerUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('invalid_usd_amount')
  }
  if (!Number.isFinite(yerPerUsd) || yerPerUsd <= 0) {
    throw new Error('invalid_yer_exchange_rate')
  }

  const amount = Math.round(amountUsd * yerPerUsd)
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('invalid_yer_amount')
  }
  return amount
}

export function isEsaalatPaymentConfigured(): boolean {
  const rate = Number(process.env.YER_PER_USD)
  return Boolean(
    process.env.ESAALAT_CLIENT_ID &&
      process.env.ESAALAT_CLIENT_SECRET &&
      process.env.ESAALAT_WEBHOOK_SECRET &&
      Number.isFinite(rate) &&
      rate > 0
  )
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token

  const clientId = process.env.ESAALAT_CLIENT_ID
  const clientSecret = process.env.ESAALAT_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('esaalat_credentials_missing')

  const response = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: {
      'ESAALAT-CLIENT-ID': clientId,
      'ESAALAT-CLIENT-SECRET': clientSecret,
    },
    cache: 'no-store',
  })

  if (!response.ok) throw new Error('esaalat_authentication_failed')

  const data = (await response.json()) as {
    access?: string
    access_token?: string
    token?: string
  }
  const token = data.access ?? data.access_token ?? data.token
  if (!token) throw new Error('esaalat_token_missing')

  tokenCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return token
}

export async function listEsaalatReceivingWallets(): Promise<EsaalatWallet[]> {
  const token = await getAccessToken()
  const response = await fetch(`${API_BASE}/wallets/`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('esaalat_wallets_unavailable')

  const payload = (await response.json()) as
    | EsaalatWallet[]
    | { results?: EsaalatWallet[] }

  const wallets = Array.isArray(payload) ? payload : payload.results ?? []
  return wallets.filter(
    (wallet) => Boolean(wallet.id) && (!wallet.currency || wallet.currency === 'YER')
  )
}

export async function createEsaalatPaymentIntent(input: {
  walletId: string
  amountYer: number
  externalOrderId: string
  idempotencyKey: string
}): Promise<Required<Pick<EsaalatIntent, 'id' | 'pay_url'>> & EsaalatIntent> {
  const token = await getAccessToken()
  const response = await fetch(`${API_BASE}/intents/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ESAALAT-IDEMPOTENCY-KEY': input.idempotencyKey,
    },
    body: JSON.stringify({
      wallet: input.walletId,
      amount: String(input.amountYer),
      currency: 'YER',
      external_order_id: input.externalOrderId,
      notes: 'KAYAN AI subscription',
    }),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error('esaalat_payment_intent_failed')

  const data = (await response.json()) as EsaalatIntent
  if (!data.id || !data.pay_url) throw new Error('esaalat_checkout_url_missing')

  const checkoutUrl = new URL(data.pay_url)
  if (
    checkoutUrl.protocol !== 'https:' ||
    !(checkoutUrl.hostname === 'esaalat.com' || checkoutUrl.hostname.endsWith('.esaalat.com'))
  ) {
    throw new Error('esaalat_checkout_url_untrusted')
  }

  return { ...data, id: data.id, pay_url: checkoutUrl.toString() }
}
