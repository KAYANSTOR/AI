import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'

export type NotificationType = 'assignment' | 'handoff' | 'high_priority' | 'provider_error'

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

export async function createNotification(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  args: {
    organizationId: string
    memberId?: string | null
    entityType: string
    entityId: string
    notificationType: NotificationType
    title: string
    body: string
  }
): Promise<NotificationRow> {
  const payload = {
    organization_id: args.organizationId,
    member_id: args.memberId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId,
    notification_type: args.notificationType,
    title: args.title,
    body: args.body,
    is_read: false,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select('id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at')
    .single()

  if (error) throw error
  return data as NotificationRow
}

export async function listNotifications(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  memberId?: string | null
): Promise<NotificationRow[]> {
  let query = supabase
    .from('notifications')
    .select('id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (memberId) query = query.eq('member_id', memberId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as NotificationRow[]
}

export async function markNotificationRead(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  notificationId: string
): Promise<NotificationRow> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', organizationId)
    .eq('id', notificationId)
    .select('id, organization_id, member_id, entity_type, entity_id, notification_type, title, body, is_read, created_at')
    .single()

  if (error) throw error
  return data as NotificationRow
}
