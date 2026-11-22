import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifyEsaalatSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header) return false

  const fields = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.trim().split('=', 2)
      return [key, value ?? '']
    })
  )
  const timestamp = fields.t
  const signature = fields.v1

  if (!timestamp || !/^\d+$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest()
  const received = Buffer.from(signature, 'hex')

  return received.length === expected.length && timingSafeEqual(expected, received)
}

type EsaalatVerifiedEvent = {
  event?: string
  payment_id?: string
  intent_id?: string
  order_id?: string
  reference?: string
  wallet_id?: string
  amount?: string | number
  currency?: string
  status?: string
}

export async function POST(request: NextRequest) {
  const secret = process.env.ESAALAT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'payment_webhook_not_configured' }, { status: 503 })

  const rawBody = await request.text()
  if (!verifyEsaalatSignature(rawBody, request.headers.get('X-Esaalat-Signature'), secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let event: EsaalatVerifiedEvent
  try {
    event = JSON.parse(rawBody) as EsaalatVerifiedEvent
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (event.event !== 'payment.verified') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const externalOrderId = event.order_id?.trim()
  const intentId = event.intent_id?.trim()
  const paymentId = event.payment_id?.trim()
  const walletId = event.wallet_id?.trim()
  const reference = event.reference?.trim() ?? ''
  const amountYer = Number(event.amount)

  if (
    event.status !== 'VERIFIED' ||
    !externalOrderId ||
    !intentId ||
    !paymentId ||
    !walletId ||
    !Number.isSafeInteger(amountYer) ||
    amountYer <= 0 ||
    event.currency !== 'YER'
  ) {
    return NextResponse.json({ error: 'invalid_verified_payment' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db.rpc('apply_verified_yemeni_wallet_payment', {
    p_external_order_id: externalOrderId,
    p_provider_intent_id: intentId,
    p_payment_id: paymentId,
    p_wallet_id: walletId,
    p_amount_yer: amountYer,
    p_currency: 'YER',
    p_reference: reference,
  })

  if (error) {
    // Returning non-2xx asks Esaalat to retry the signed webhook.
    return NextResponse.json({ error: 'payment_activation_failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    result: data ?? 'no_result',
  })
}
