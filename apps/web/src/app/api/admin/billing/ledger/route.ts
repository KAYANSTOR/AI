import { createAdminClient } from '@/lib/db/admin'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 50))
  const { data, error } = await createAdminClient().from('billing_ledger_entries')
    .select('id,organization_id,payment_request_id,plan_id,wallet_id,entry_type,status,currency,amount_yer,amount_usd,exchange_rate,provider_code,sender_name,transfer_reference,recorded_by,metadata,recorded_at,organizations(name),plans(name),manual_yemen_wallets(display_name)')
    .order('recorded_at', { ascending: false }).limit(limit)
  if (error) return Response.json({ error: 'ledger_query_failed' }, { status: 500 })
  return Response.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
