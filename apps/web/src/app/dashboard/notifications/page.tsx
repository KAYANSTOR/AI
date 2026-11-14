import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, Bell, MessageSquare, Calendar } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { notificationMemberFilter } from '@/lib/notifications'
import { NotificationReadAction } from './notification-read-action'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()

  const { data: member, error: memberError } = await db
    .from('organization_members')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId)
    .maybeSingle()

  const { data: notifications, error: notificationsError } = await db
    .from('notifications')
    .select('id, title, body, entity_type, entity_id, is_read, created_at')
    .eq('organization_id', context.organizationId)
    .or(notificationMemberFilter((member?.id as string | null) ?? null))
    .order('created_at', { ascending: false })
    .limit(50)

  if (memberError || notificationsError) {
    console.error('Unable to load notifications page', { memberError, notificationsError })
    return (
      <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-error/30 bg-error-soft/40 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-error" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-text">تعذر تحميل الإشعارات</h1>
          <p className="mt-2 text-sm text-text-muted">تحقق من اتصالك ثم أعد المحاولة.</p>
        </div>
        <form action="/dashboard/notifications" method="get">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            إعادة المحاولة
          </button>
        </form>
      </div>
    )
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const items = notifications ?? []
  const unreadCount = items.filter((item) => !item.is_read).length
  const renderNotification = (notification: (typeof items)[number]) => (
    <div key={notification.id} className="flex items-center gap-2">
      <Link
        href={getNotificationHref(notification.entity_type, notification.entity_id)}
        className="block min-w-0 flex-1"
      >
        <ListRow
          title={notification.title}
          subtitle={notification.body}
          meta={formatDateTime(notification.created_at, context.timezone)}
          trailing="meta"
          icon={getNotificationIcon(notification.entity_type)}
          className={notification.is_read ? undefined : 'border-primary/20 bg-primary-light/10'}
        />
      </Link>
      {!notification.is_read ? (
        <NotificationReadAction notificationId={notification.id} />
      ) : null}
    </div>
  )
  const todayItems = items.filter((item) => new Date(item.created_at).getTime() >= startOfToday)
  const earlierItems = items.filter((item) => new Date(item.created_at).getTime() < startOfToday)

  function getNotificationIcon(entityType: string) {
    if (entityType.includes('conversation')) return <MessageSquare className="h-5 w-5" />
    if (entityType.includes('appointment')) return <Calendar className="h-5 w-5" />
    if (entityType.includes('channel')) return <AlertCircle className="h-5 w-5 text-warning" />
    return <Bell className="h-5 w-5" />
  }

  function getNotificationHref(entityType: string, entityId: string) {
    if (entityType.includes('conversation')) return `/dashboard/conversations/${entityId}`
    if (entityType.includes('appointment')) return '/dashboard/appointments'
    if (entityType.includes('channel')) return '/dashboard/channels'
    return '/dashboard'
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">الإشعارات</h1>
          <p className="mt-1 text-sm text-text-muted">
            تنبيهات المحادثات والقنوات والمهام من حسابك فقط.
          </p>
        </div>
        <NotificationReadAction unreadCount={unreadCount} />
      </div>

      {items.length === 0 ? (
        <MobileEmptyState
          icon={<Bell className="h-8 w-8" aria-hidden="true" />}
          title="لا توجد إشعارات"
          description="ستصلك هنا تنبيهات المحادثات الجديدة والتصعيد وربط القنوات بعد بدء الاستخدام."
          action={
            <Link
              href="/dashboard/channels"
              className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
            >
              ربط قناة
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {todayItems.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title="اليوم" />
              <div className="space-y-2.5">
                {todayItems.map(renderNotification)}
              </div>
            </div>
          )}

          {earlierItems.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title={todayItems.length > 0 ? 'سابقاً' : 'جميع الإشعارات'} />
              <div className="space-y-2.5">
                {earlierItems.map(renderNotification)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
