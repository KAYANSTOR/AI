import { getSql } from '@/lib/db/pool'
import { auditAdminAction, requireAdmin } from '@/lib/admin-control-plane'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = requireAdmin(request); if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  const rows = await getSql()`SELECT pp.*, p.code AS plan_code, p.name AS plan_name FROM plan_prices pp JOIN plans p ON p.id=pp.plan_id WHERE pp.is_active=true ORDER BY p.code, pp.billing_cycle, pp.currency`
  return Response.json({ items: rows }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const auth = requireAdmin(request); if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  let b: Record<string, unknown>; try { b = await request.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const planCode = typeof b.planCode === 'string' ? b.planCode : ''
  const cycle = b.billingCycle === 'yearly' ? 'yearly' : b.billingCycle === 'monthly' ? 'monthly' : ''
  const currency = typeof b.currency === 'string' ? b.currency.toUpperCase() : ''
  const amount = Number(b.amount); const rate = b.exchangeRateToUsd == null ? null : Number(b.exchangeRateToUsd)
  if (!/^[A-Z]{3}$/.test(currency) || !cycle || !Number.isFinite(amount) || amount < 0 || (rate !== null && (!Number.isFinite(rate) || rate <= 0))) return Response.json({ error: 'invalid_price' }, { status: 400 })
  const sql = getSql(); const [row] = await sql.begin(async tx => {
    const [plan] = await tx`SELECT id FROM plans WHERE code=${planCode} LIMIT 1`; if (!plan) throw new Error('plan_not_found')
    return tx`INSERT INTO plan_prices (plan_id,billing_cycle,currency,amount,exchange_rate_to_usd,is_active,updated_at) VALUES (${plan.id},${cycle},${currency},${amount},${rate},true,now()) ON CONFLICT (plan_id,billing_cycle,currency) DO UPDATE SET amount=EXCLUDED.amount,exchange_rate_to_usd=EXCLUDED.exchange_rate_to_usd,is_active=true,updated_at=now() RETURNING *`
  })
  await auditAdminAction('billing.price_upserted', 'plan_price', String(row.id), 'تحديث سعر باقة متعدد العملات.', row)
  return Response.json({ item: row }, { status: 201 })
}
