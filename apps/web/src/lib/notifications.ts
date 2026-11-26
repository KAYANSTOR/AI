import type { DbClient } from '@/lib/db/client'
import type { createClient } from '@/lib/db/server'

export type NotificationType =
  | 'assignment'
  | 'handoff'
  | 'high_priority'
  | 'provider_error'
  | 'workflow'

export type NotificationRow = {
  id: string
  organization_id: string
  member_id: string | null
  entity_type: string
  entity_id: string
  notification_type: NotificationType
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export function notificationMemberFilter(memberId: string | null) {
  return memberId ? `member_id.is.null,member_id.eq.${memberId}` : 'member_id.is.null'
}

// Match SLA escalation keys and legacy technical labels without hiding regular high-priority alerts.
export const personalNotificationFilter =
  'and(or(idempotency_key.is.null,and(idempotency_key.not.like.sla-default:%,idempotency_key.not.like.esc:%:sla_warning:%,idempotency_key.not.like.esc:%:sla_breach:%)),title.not.in.(تجاوز SLA,تحذير SLA),body.not.ilike.%sla_warning%,body.not.ilike.%sla_breach%)'

export function localizeNotification<T extends { title: string; body: string }>(notification: T) {
  const translate = (text: string) => text
    .replace(/sla_warning/gi, 'اقتراب انتهاء مهلة الاستجابة')
    .replace(/sla_breach/gi, 'تجاوز مهلة الاستجابة')
    .replace(/(?:مهلة\s+)?\bSLA\b/gi, 'مهلة الاستجابة')
  return { ...notification, title: translate(notification.title), body: translate(notification.body) }
}

export async function createNotification(
  db: DbClient | Awaited<ReturnType<typeof createClient>>,
  args: {
    organizationId: string
    memberId?: string | null
    entityType: string
    entityId: string
    notificationType: NotificationType | string
    title: string
    body: string
    idempotencyKey?: string | null
  }
): Promise<NotificationRow | null> {
  const payload = {
    organization_id: args.organizationId,
    member_id: args.memberId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId,
    notification_type: args.notificationType,
    title: args.title,
    body: args.body,
    is_read: false,
    idempotency_key: args.idempotencyKey ?? null,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('notifications')
    .insert(payload)
    .select(
      'id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at'
    )
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return null
    throw error
  }
  return data as unknown as NotificationRow
}

export async function listNotifications(
  db: DbClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  memberId?: string | null
): Promise<NotificationRow[]> {
  let query = db
    .from('notifications')
    .select(
      'id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (memberId) query = query.eq('member_id', memberId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as NotificationRow[]
}

export async function markNotificationRead(
  db: DbClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  notificationId: string
): Promise<NotificationRow> {
  const { data, error } = await db
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', organizationId)
    .eq('id', notificationId)
    .select(
      'id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at'
    )
    .single()

  if (error) throw error
  return data as unknown as NotificationRow
}
