import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveApiKeyOrganization } from '@/lib/api-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const resolved = await resolveApiKeyOrganization(supabase, token)
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!resolved.scopes.includes('read') && !resolved.scopes.includes('*')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)))

  const { data, error } = await supabase
    .from('contacts')
    .select('id, full_name, phone, email, created_at')
    .eq('organization_id', resolved.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data ?? [],
    organization_id: resolved.organizationId,
  })
}
