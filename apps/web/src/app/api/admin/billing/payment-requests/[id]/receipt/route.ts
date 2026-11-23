import { createAdminClient } from '@/lib/db/admin'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeKayanAdminRequest(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
  const { id } = await params
  const { data, error } = await createAdminClient().from('manual_wallet_payment_requests')
    .select('receipt_image_base64,receipt_mime_type').eq('id', id).maybeSingle()
  if (error || !data) return Response.json({ error: 'receipt_not_found' }, { status: 404 })
  const bytes = Buffer.from(String(data.receipt_image_base64), 'base64')
  if (bytes.length > 2 * 1024 * 1024) return Response.json({ error: 'receipt_too_large' }, { status: 413 })
  return new Response(bytes, {
    headers: {
      'Content-Type': String(data.receipt_mime_type),
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
