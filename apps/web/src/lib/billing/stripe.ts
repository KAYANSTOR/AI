import type { SupabaseClient } from '@supabase/supabase-js'

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'grace_period'
  | 'suspended'
  | 'cancelled'

const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'cancelled', 'suspended'],
  active: ['past_due', 'grace_period', 'cancelled', 'suspended'],
  past_due: ['active', 'grace_period', 'suspended', 'cancelled'],
  grace_period: ['active', 'suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: ['trial', 'active'],
}

export function canTransitionSubscription(
  from: string,
  to: SubscriptionStatus
): boolean {
  const f = from as SubscriptionStatus
  if (!(f in ALLOWED)) return true
  return ALLOWED[f].includes(to) || f === to
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

/**
 * Applies a provider subscription event to the local subscriptions row.
 * Does not call Stripe APIs — used by webhooks after signature verification.
 */
export async function applySubscriptionEvent(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    status: SubscriptionStatus
    planTier?: string | null
    stripeCustomerId?: string | null
    stripeSubscriptionId?: string | null
    currentPeriodEnd?: string | null
  }
): Promise<void> {
  const { data: current } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (current && !canTransitionSubscription(String(current.status), input.status)) {
    throw new Error(`illegal subscription transition ${current.status} → ${input.status}`)
  }

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  }
  if (input.planTier) patch.plan_tier = input.planTier
  if (input.stripeCustomerId) patch.stripe_customer_id = input.stripeCustomerId
  if (input.stripeSubscriptionId) patch.stripe_subscription_id = input.stripeSubscriptionId
  if (input.currentPeriodEnd) patch.current_period_end = input.currentPeriodEnd

  if (current) {
    const { error } = await supabase
      .from('subscriptions')
      .update(patch)
      .eq('id', current.id)
      .eq('organization_id', input.organizationId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('subscriptions').insert({
      organization_id: input.organizationId,
      ...patch,
    })
    if (error) throw error
  }

  await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    actor_type: 'system',
    action: 'subscription.status_changed',
    entity_type: 'subscription',
    entity_id: current?.id ?? null,
    metadata: {
      status: input.status,
      plan_tier: input.planTier,
      stripe_subscription_id: input.stripeSubscriptionId,
    },
  })
}

/**
 * Creates a Checkout Session URL when Stripe is configured.
 * Returns null when secrets are absent so UI can show a configuration message.
 */
export async function createCheckoutSessionUrl(input: {
  organizationId: string
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
  priceId?: string
}): Promise<string | null> {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null

  const priceId = input.priceId || process.env.STRIPE_PRICE_ID
  if (!priceId) return null

  const body = new URLSearchParams()
  body.set('mode', 'subscription')
  body.set('success_url', input.successUrl)
  body.set('cancel_url', input.cancelUrl)
  body.set('line_items[0][price]', priceId)
  body.set('line_items[0][quantity]', '1')
  body.set('client_reference_id', input.organizationId)
  body.set('metadata[organization_id]', input.organizationId)
  if (input.customerEmail) body.set('customer_email', input.customerEmail)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe checkout failed: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { url?: string }
  return data.url ?? null
}
