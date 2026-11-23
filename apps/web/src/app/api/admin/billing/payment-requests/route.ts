import { createAdminClient } from '@/lib/db/admin'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  const url = new URL(request.url)
  const requestedStatus = url.searchParams.get('status') ?? 'pending'
  if (!['pending', 'approved', 'rejected', 'all'].includes(requestedStatus)) {
    return Response.json({ error: 'invalid_status' }, { status: 400 })
  }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  let query = createAdminClient().from('manual_wallet_payment_requests')
    .select('id,organization_id,plan_id,plan_code,billing_cycle,wallet_id,amount_usd,amount_yer,exchange_rate,sender_name,transfer_reference,receipt_mime_type,status,review_note,reviewed_by,reviewed_at,created_at,manual_yemen_wallets(display_name,account_name,account_number,provider_code),plans(name),organizations(name)')
    .order('created_at', { ascending: false }).limit(limit)
  if (requestedStatus !== 'all') query = query.eq('status', requestedStatus)
  const { data, error } = await query
  if (error) return Response.json({ error: 'billing_query_failed' }, { status: 500 })
  return Response.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  const actor = request.headers.get('x-kayan-admin-actor')?.trim().slice(0, 160) || 'Kayan AI Admin'
  if (!id || !action) return Response.json({ error: 'id_and_action_required' }, { status: 400 })
  if (action === 'reject' && note.length < 5) return Response.json({ error: 'rejection_reason_required' }, { status: 400 })
  const { data, error } = await createAdminClient().rpc('review_manual_wallet_payment', {
    p_request_id: id,
    p_action: action,
    p_reviewed_by: actor,
    p_review_note: note || null,
  })
  if (error) return Response.json({ error: 'review_failed' }, { status: 500 })
  const result = String(data ?? '')
  if (result === 'not_found') return Response.json({ error: 'not_found' }, { status: 404 })
  if (result.startsWith('already_')) return Response.json({ error: result }, { status: 409 })
  return Response.json({ ok: true, status: result }, { headers: { 'Cache-Control': 'no-store' } })
}
