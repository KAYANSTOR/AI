import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { notificationMemberFilter, type NotificationRow } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTIFICATION_COLUMNS =
  'id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at'

async function getMemberId(db: Awaited<ReturnType<typeof createClient>>, organizationId: string, userId: string) {
  const { data, error } = await db
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { memberId: null, error }
  return { memberId: (data?.id as string | null) ?? null, error: null }
}

export async function GET() {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = await createClient()
  const { memberId, error: memberError } = await getMemberId(db, context.organizationId, context.userId)
  if (memberError) {
    console.error('Unable to resolve notification member:', memberError.message)
    return NextResponse.json({ error: 'notifications_failed' }, { status: 500 })
  }

  const { data, error } = await db
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('organization_id', context.organizationId)
    .or(notificationMemberFilter(memberId))
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

  const db = await createClient()
  const { memberId, error: memberError } = await getMemberId(db, context.organizationId, context.userId)
  if (memberError) {
    console.error('Unable to resolve notification member:', memberError.message)
    return NextResponse.json({ error: 'notifications_failed' }, { status: 500 })
  }

  let query = db
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', context.organizationId)
    .or(notificationMemberFilter(memberId))
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
