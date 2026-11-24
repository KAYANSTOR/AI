import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { resolveApiKeyOrganization } from '@/lib/api-keys'
import { logDatabaseError } from '@/lib/db/errors'
import { decodeContactsCursor, encodeContactsCursor, parseContactsLimit } from '@/lib/api/contacts-pagination'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const resolved = await resolveApiKeyOrganization(db, token)
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!resolved.scopes.includes('read') && !resolved.scopes.includes('*')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const limit = parseContactsLimit(req.nextUrl.searchParams.get('limit'))
  const rawCursor = req.nextUrl.searchParams.get('cursor')
  const cursor = decodeContactsCursor(rawCursor)
  if (rawCursor && !cursor) return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })

  let query = db
    .from('contacts')
    .select('id, full_name, phone, email, created_at')
    .eq('organization_id', resolved.organizationId)
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (error) {
    // Never leak SQL/driver details to API clients.
    logDatabaseError('api_v1_contacts', error)
    return NextResponse.json({ error: 'internal_error', message: 'Unable to load contacts.' }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{ id: string; created_at: string }>
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]

  return NextResponse.json({
    data: page,
    organization_id: resolved.organizationId,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeContactsCursor(last) : null,
    },
  })
}
