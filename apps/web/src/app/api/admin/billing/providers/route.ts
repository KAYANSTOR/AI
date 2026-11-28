import { getSql } from '@/lib/db/pool'
import { auditAdminAction, requireAdmin } from '@/lib/admin-control-plane'
import { redactProviderConfiguration } from '@/lib/billing/payment-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redactRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    ...row,
    configuration: redactProviderConfiguration(row.configuration),
  }))
}

/**
 * OPS-004 — admin-only provider catalogue. Rows are returned with credential-bearing
 * configuration values redacted, so an operator cannot read provider secrets from the
 * dashboard response even though the table itself is service-role only.
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  const rows = await getSql()`SELECT id::text id,code,display_name,provider_type,configuration,is_active,created_at::text created_at,updated_at::text updated_at FROM billing_payment_providers ORDER BY display_name` as Array<Record<string, unknown>>
  return Response.json({ items: redactRows(rows) })
}

export async function POST(request: Request) {
  const auth = requireAdmin(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : ''
  const name = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const type = typeof body.providerType === 'string' ? body.providerType : ''
  if (!/^[a-z0-9_-]{2,50}$/.test(code) || name.length < 2 || !['manual_wallet', 'international', 'local_gateway', 'other'].includes(type)) {
    return Response.json({ error: 'invalid_provider' }, { status: 400 })
  }
  const configuration = body.configuration && typeof body.configuration === 'object' ? body.configuration : {}
  const [row] = await getSql()`INSERT INTO billing_payment_providers(code,display_name,provider_type,configuration,is_active,updated_at) VALUES(${code},${name},${type},${JSON.stringify(configuration)}::jsonb,${body.isActive === true},now()) ON CONFLICT(code) DO UPDATE SET display_name=EXCLUDED.display_name,provider_type=EXCLUDED.provider_type,configuration=EXCLUDED.configuration,is_active=EXCLUDED.is_active,updated_at=now() RETURNING id::text id,code,display_name,provider_type,configuration,is_active,updated_at::text updated_at` as Array<Record<string, unknown>>
  if (!row) return Response.json({ error: 'provider_write_failed' }, { status: 500 })
  const redacted = { ...row, configuration: redactProviderConfiguration(row.configuration) }
  await auditAdminAction('billing.provider_upserted', 'payment_provider', String(row.id), 'تحديث مزود دفع.', redacted)
  return Response.json({ item: redacted }, { status: 201 })
}
