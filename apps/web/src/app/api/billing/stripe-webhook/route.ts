import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applySubscriptionEvent, type SubscriptionStatus } from '@/lib/billing/stripe'
import { createHmac, timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string
): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k.trim(), v?.trim() ?? '']
    })
  )
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  // Reject stale signatures (>5 min)
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (Number.isNaN(age) || age > 300) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return status === 'trialing' ? 'trial' : 'active'
    case 'past_due':
      return 'past_due'
    case 'unpaid':
      return 'grace_period'
    case 'canceled':
      return 'cancelled'
    case 'paused':
    case 'incomplete_expired':
      return 'suspended'
    default:
      return 'active'
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const payload = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!verifyStripeSignature(payload, sig, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let event: {
    type: string
    data: { object: Record<string, unknown> }
  }
  try {
    event = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const obj = event.data.object
  const organizationId =
    (obj.client_reference_id as string | undefined) ||
    ((obj.metadata as Record<string, string> | undefined)?.organization_id)

  if (!organizationId) {
    // Checkout completed without org metadata — ignore safely
    return NextResponse.json({ ok: true, skipped: 'no_organization' })
  }

  const supabase = createAdminClient()

  try {
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const status = mapStripeStatus(String(obj.status ?? 'active'))
      const periodEnd = obj.current_period_end
        ? new Date(Number(obj.current_period_end) * 1000).toISOString()
        : null

      await applySubscriptionEvent(supabase, {
        organizationId,
        status: event.type === 'customer.subscription.deleted' ? 'cancelled' : status,
        stripeCustomerId: (obj.customer as string) ?? null,
        stripeSubscriptionId: (obj.id as string) ?? null,
        currentPeriodEnd: periodEnd,
      })
    }

    if (event.type === 'checkout.session.completed') {
      await applySubscriptionEvent(supabase, {
        organizationId,
        status: 'active',
        stripeCustomerId: (obj.customer as string) ?? null,
        stripeSubscriptionId: (obj.subscription as string) ?? null,
      })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'handler_failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
