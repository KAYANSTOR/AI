import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { toCsv } from '@/lib/export/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (context.role === 'read_only') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .select('id, status, source, source_channel, created_at, contact_id')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const csv = toCsv(
    (data ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      source: r.source,
      source_channel: r.source_channel,
      contact_id: r.contact_id,
      created_at: r.created_at,
    })),
    ['id', 'status', 'source', 'source_channel', 'contact_id', 'created_at']
  )

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
