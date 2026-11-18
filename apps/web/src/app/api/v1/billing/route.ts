import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { resolveApiKeyOrganization } from '@/lib/api-keys'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Read-only integration contract for Kayan Soft Hub.
 * It exposes billing state and bounded usage summary only; it never exposes
 * Stripe secrets, channel credentials, conversations, prompts, or customer data.
 */
export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const resolved = await resolveApiKeyOrganization(db, token)
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!resolved.scopes.includes('read') && !resolved.scopes.includes('read:billing') && !resolved.scopes.includes('*')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [{ data: organization, error: organizationError }, { data: subscription, error: subscriptionError }, snapshot] = await Promise.all([
    db.from('organizations').select('name').eq('id', resolved.organizationId).maybeSingle(),
    db.from('subscriptions').select('period_start, period_end').eq('organization_id', resolved.organizationId).maybeSingle(),
    loadBillingSnapshot(db, resolved.organizationId),
  ])

  if (organizationError) return NextResponse.json({ error: 'organization_lookup_failed' }, { status: 500 })
  if (subscriptionError) return NextResponse.json({ error: 'subscription_lookup_failed' }, { status: 500 })

  return NextResponse.json({
    organizationId: resolved.organizationId,
    organizationName: organization?.name ?? '',
    subscription: {
      status: snapshot.status,
      planCode: snapshot.planCode,
      periodStart: subscription?.period_start ?? null,
      periodEnd: subscription?.period_end ?? null,
    },
    usage: snapshot.usage,
  })
}
