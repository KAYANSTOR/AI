import { createAdminClient } from '@/lib/db/admin'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PLAN_CODES = new Set(['starter', 'growth', 'pro'])
const LIMIT_KEYS = ['users', 'agents', 'channels', 'voice_minutes', 'ai_messages', 'automation_runs', 'campaign_sends', 'storage_mb'] as const

export async function GET(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  const { data, error } = await createAdminClient().from('plans')
    .select('id,code,name,description,monthly_price,currency,limits,is_active,updated_at')
    .in('code', ['starter', 'growth', 'pro']).order('monthly_price')
  if (error) return Response.json({ error: 'plan_query_failed' }, { status: 500 })
  return Response.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const code = typeof body.code === 'string' ? body.code : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : ''
  const monthlyPrice = Number(body.monthlyPrice)
  const rawLimits = body.limits && typeof body.limits === 'object' ? body.limits as Record<string, unknown> : {}
  if (!PLAN_CODES.has(code) || name.length < 2 || name.length > 100 || !Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || monthlyPrice > 100000) {
    return Response.json({ error: 'invalid_plan' }, { status: 400 })
  }
  const { data: currentPlan, error: currentError } = await createAdminClient().from('plans')
    .select('limits').eq('code', code).maybeSingle()
  if (currentError || !currentPlan) return Response.json({ error: 'plan_not_found' }, { status: 404 })
  const limits: Record<string, number> = currentPlan.limits && typeof currentPlan.limits === 'object'
    ? { ...(currentPlan.limits as Record<string, number>) }
    : {}
  for (const key of LIMIT_KEYS) {
    if (rawLimits[key] === undefined) continue
    const value = Number(rawLimits[key])
    if (!Number.isSafeInteger(value) || value < 0) return Response.json({ error: `invalid_limit_${key}` }, { status: 400 })
    limits[key] = value
  }
  const { data, error } = await createAdminClient().from('plans').update({
    name, description, monthly_price: monthlyPrice, currency: 'USD', limits,
    is_active: body.isActive !== false, updated_at: new Date().toISOString(),
  }).eq('code', code).select('id,code,name,description,monthly_price,currency,limits,is_active,updated_at').maybeSingle()
  if (error || !data) return Response.json({ error: 'plan_update_failed' }, { status: 500 })
  return Response.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}
