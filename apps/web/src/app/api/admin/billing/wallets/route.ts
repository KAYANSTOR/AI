import { createAdminClient } from '@/lib/db/admin'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PROVIDERS = new Set(['jawali', 'jeeb', 'onecash', 'kuraimi', 'other'])

export async function GET(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  const { data, error } = await createAdminClient().from('manual_yemen_wallets')
    .select('id,provider_code,display_name,account_name,account_number,instructions,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: 'wallet_query_failed' }, { status: 500 })
  return Response.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const providerCode = typeof body.provider_code === 'string' ? body.provider_code : ''
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const accountName = typeof body.account_name === 'string' ? body.account_name.trim() : ''
  const accountNumber = typeof body.account_number === 'string' ? body.account_number.trim() : ''
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 500) : null
  if (!PROVIDERS.has(providerCode) || displayName.length < 2 || displayName.length > 120 || accountName.length < 2 || accountName.length > 160 || accountNumber.length < 3 || accountNumber.length > 80) {
    return Response.json({ error: 'invalid_wallet' }, { status: 400 })
  }
  const row = {
    ...(typeof body.id === 'string' ? { id: body.id } : {}),
    provider_code: providerCode, display_name: displayName, account_name: accountName,
    account_number: accountNumber, instructions, is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await createAdminClient().from('manual_yemen_wallets')
    .upsert(row, { onConflict: 'id' }).select('id,provider_code,display_name,account_name,account_number,instructions,is_active').single()
  if (error || !data) return Response.json({ error: 'wallet_save_failed' }, { status: 500 })
  return Response.json({ item: data }, { status: typeof body.id === 'string' ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
}
