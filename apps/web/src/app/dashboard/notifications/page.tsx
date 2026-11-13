import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, Bell, MessageSquare, UserCheck, Calendar } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()

  const { data: notifications } = await db
    .from('notifications')
    .select('id, title, body, entity_type, entity_id, is_read, created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const items = notifications ?? []
  const todayItems = items.filter(
    (item) => new Date(item.created_at).getTime() >= startOfToday
  )
  const earlierItems = items.filter(
    (item) => new Date(item.created_at).getTime() < startOfToday
  )

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
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الإشعارات</h1>
        <p className="mt-1 text-sm text-text-muted">
          آخر التنبيهات وإشعارات النظام والمحادثات التي تحتاج تدخلاً.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="space-y-4">
          {/* Mock previews matching Figma node 15:2455 if database has no rows */}
          <SectionHeader title="اليوم" />
          <div className="space-y-2.5">
            <Link href="/dashboard/conversations" className="block">
              <ListRow
                title="محادثة تحتاج إلى موظف"
                subtitle="سارة المطيري طلبت التحدث مع موظف"
                meta="10:27"
                trailing="meta"
                icon={<UserCheck className="h-5 w-5 text-primary" />}
              />
            </Link>
            <Link href="/dashboard/channels" className="block">
              <ListRow
                title="انقطع اتصال قناة واتساب"
                subtitle="رقم الفروع"
                meta="09:12"
                trailing="meta"
                icon={<AlertCircle className="h-5 w-5 text-warning" />}
              />
            </Link>
          </div>

          <SectionHeader title="أمس" />
          <div className="space-y-2.5">
            <Link href="/dashboard/conversations" className="block">
              <ListRow
                title="مهمة متأخرة"
                subtitle="الرد على استفسار الضمان"
                meta="أمس"
                trailing="meta"
                icon={<Bell className="h-5 w-5 text-secondary" />}
              />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {todayItems.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title="اليوم" />
              <div className="space-y-2.5">
                {todayItems.map((n) => (
                  <Link
                    key={n.id}
                    href={getNotificationHref(n.entity_type, n.entity_id)}
                    className="block"
                  >
                    <ListRow
                      title={n.title}
                      subtitle={n.body}
                      meta={formatDateTime(n.created_at, context.timezone)}
                      trailing="meta"
                      icon={getNotificationIcon(n.entity_type)}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {earlierItems.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader title={todayItems.length > 0 ? 'سابقاً' : 'جميع الإشعارات'} />
              <div className="space-y-2.5">
                {earlierItems.map((n) => (
                  <Link
                    key={n.id}
                    href={getNotificationHref(n.entity_type, n.entity_id)}
                    className="block"
                  >
                    <ListRow
                      title={n.title}
                      subtitle={n.body}
                      meta={formatDateTime(n.created_at, context.timezone)}
                      trailing="meta"
                      icon={getNotificationIcon(n.entity_type)}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
