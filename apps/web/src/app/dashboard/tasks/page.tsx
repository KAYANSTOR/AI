import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Clock3, ListTodo, AlertTriangle } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { Chip } from '@/components/ui/chip'

export const dynamic = 'force-dynamic'

type TaskItem = {
  id: string
  title: string
  subtitle: string
  status: 'today' | 'overdue' | 'done'
  href: string
  meta: string
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>
}) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const filter = (await searchParams)?.filter || 'all'
  const db = await createClient()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const tasks: TaskItem[] = []

  // Open handoff conversations → actionable tasks
  const { data: handoffs } = await db
    .from('conversations')
    .select('id, status, updated_at, contacts(full_name)')
    .eq('organization_id', context.organizationId)
    .in('status', ['needs_human', 'handoff', 'open'])
    .order('updated_at', { ascending: false })
    .limit(30)

  for (const row of handoffs ?? []) {
    const contact = row.contacts as unknown as { full_name?: string } | null
    const updated = new Date(row.updated_at)
    const isOverdue = updated.getTime() < startOfToday.getTime() - 24 * 60 * 60 * 1000
    tasks.push({
      id: `conv-${row.id}`,
      title: 'متابعة محادثة تحتاج موظفاً',
      subtitle: contact?.full_name || 'عميل',
      status: isOverdue ? 'overdue' : 'today',
      href: `/dashboard/conversations/${row.id}`,
      meta: formatDateTime(row.updated_at, context.timezone),
    })
  }

  // Upcoming / overdue appointments as follow-up tasks
  const { data: appointments } = await db
    .from('appointments')
    .select('id, starts_at, status, contacts(full_name), services(name)')
    .eq('organization_id', context.organizationId)
    .in('status', ['scheduled', 'confirmed', 'pending'])
    .order('starts_at', { ascending: true })
    .limit(30)

  for (const row of appointments ?? []) {
    const contact = row.contacts as unknown as { full_name?: string } | null
    const service = row.services as unknown as { name?: string } | null
    const starts = new Date(row.starts_at)
    const isOverdue = starts.getTime() < now.getTime()
    const isToday =
      starts.getFullYear() === now.getFullYear() &&
      starts.getMonth() === now.getMonth() &&
      starts.getDate() === now.getDate()

    tasks.push({
      id: `appt-${row.id}`,
      title: service?.name ? `تأكيد موعد: ${service.name}` : 'تأكيد موعد',
      subtitle: contact?.full_name || 'عميل',
      status: isOverdue ? 'overdue' : isToday ? 'today' : 'today',
      href: '/dashboard/appointments',
      meta: formatDateTime(row.starts_at, context.timezone),
    })
  }

  const filtered =
    filter === 'all'
      ? tasks
      : tasks.filter((t) => t.status === filter)

  const todayItems = filtered.filter((t) => t.status === 'today')
  const overdueItems = filtered.filter((t) => t.status === 'overdue')
  const doneItems = filtered.filter((t) => t.status === 'done')

  const counts = {
    all: tasks.length,
    today: tasks.filter((t) => t.status === 'today').length,
    overdue: tasks.filter((t) => t.status === 'overdue').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">المهام</h1>
        <p className="mt-1 text-sm text-text-muted">متابعات الفريق والمحادثات والمواعيد التي تحتاج إجراءً.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/dashboard/tasks?filter=all">
          <Chip label="الكل" selected={filter === 'all'} count={counts.all} />
        </Link>
        <Link href="/dashboard/tasks?filter=today">
          <Chip label="اليوم" selected={filter === 'today'} count={counts.today} />
        </Link>
        <Link href="/dashboard/tasks?filter=overdue">
          <Chip label="متأخرة" selected={filter === 'overdue'} count={counts.overdue} />
        </Link>
        <Link href="/dashboard/tasks?filter=done">
          <Chip label="مكتملة" selected={filter === 'done'} count={counts.done} />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState
          title="لا توجد مهام حالياً"
          description="ستظهر هنا المحادثات التي تحتاج تدخلاً والمواعيد التي تتطلب تأكيداً."
          icon={<ListTodo className="h-8 w-8" aria-hidden="true" />}
          action={
            <Link
              href="/dashboard/conversations"
              className="mt-2 flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground shadow-sm"
            >
              فتح صندوق المحادثات
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {overdueItems.length > 0 && (
            <section className="space-y-2.5">
              <SectionHeader title="متأخرة" />
              {overdueItems.map((task) => (
                <Link key={task.id} href={task.href} className="block">
                  <ListRow
                    title={task.title}
                    subtitle={task.subtitle}
                    meta={task.meta}
                    trailing="badge"
                    badgeLabel="متأخرة"
                    badgeTone="warning"
                    icon={<AlertTriangle className="h-5 w-5 text-warning" />}
                  />
                </Link>
              ))}
            </section>
          )}

          {todayItems.length > 0 && (
            <section className="space-y-2.5">
              <SectionHeader title="اليوم" />
              {todayItems.map((task) => (
                <Link key={task.id} href={task.href} className="block">
                  <ListRow
                    title={task.title}
                    subtitle={task.subtitle}
                    meta={task.meta}
                    trailing="badge"
                    badgeLabel="جديدة"
                    badgeTone="neutral"
                    icon={<Clock3 className="h-5 w-5 text-primary" />}
                  />
                </Link>
              ))}
            </section>
          )}

          {doneItems.length > 0 && (
            <section className="space-y-2.5">
              <SectionHeader title="مكتملة" />
              {doneItems.map((task) => (
                <Link key={task.id} href={task.href} className="block">
                  <ListRow
                    title={task.title}
                    subtitle={task.subtitle}
                    meta={task.meta}
                    trailing="badge"
                    badgeLabel="مكتملة"
                    badgeTone="success"
                    icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                  />
                </Link>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
