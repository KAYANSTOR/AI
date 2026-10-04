import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import type { NotificationRow } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTIFICATION_COLUMNS =
  'id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at'

export async function GET() {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Unable to load notifications:', error.message)
    return NextResponse.json({ error: 'notifications_failed' }, { status: 500 })
  }

  const notifications = (data ?? []) as NotificationRow[]
  return NextResponse.json({
    notifications,
    unread: notifications.filter((notification) => !notification.is_read).length,
  })
}

export async function POST(request: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { id?: string; all?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }

  const supabase = await createClient()
  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', context.organizationId)
    .eq('is_read', false)

  if (!body.all) {
    if (!body.id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    query = query.eq('id', body.id)
  }

  const { error } = await query
  if (error) {
    console.error('Unable to update notifications:', error.message)
    return NextResponse.json({ error: 'notifications_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
