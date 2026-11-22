import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  MessageSquareText, Users, UserRound, CalendarDays, ClipboardList,
  FileText, Megaphone, RadioTower, BookOpen, BarChart3, ChevronLeft,
} from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { formatNumber } from '@/lib/i18n/format'
import { getHoursAgoIso, getDaysAgoIso } from '@/lib/i18n/current-date'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()
  const since24h = getHoursAgoIso(24)
  const since30d = getDaysAgoIso(30)

  const [
    { count: totalConversations },
    { count: openConversations },
    { count: totalContacts },
    { data: completedOrders },
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).in('status', ['open', 'needs_human', 'handoff', 'active']),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    db.from('orders').select('total, currency, created_at').eq('organization_id', context.organizationId).eq('status', 'completed').gte('created_at', since30d).limit(2000),
  ])

  const orders = completedOrders ?? []
  const recentOrders = orders.filter((order) => String(order.created_at) >= since24h)
  function moneyByCurrency(rows: typeof orders) {
    const totals = new Map<string, number>()
    for (const order of rows) {
      const currency = String(order.currency || 'SAR').toUpperCase()
      totals.set(currency, (totals.get(currency) ?? 0) + Number(order.total || 0))
    }
    return [...totals.entries()].map(([currency, amount]) => ({
      currency,
      amount: new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount),
    }))
  }
  function moneyLabel(rows: typeof orders) {
    const values = moneyByCurrency(rows)
    return values.length
      ? values.map((item) => item.amount + ' ' + item.currency).join(' · ')
      : 'لا توجد طلبات مكتملة'
  }

  const metricCards = [
    { label: 'إجمالي المحادثات', value: totalConversations ?? 0, icon: MessageSquareText },
    { label: 'محادثات مفتوحة', value: openConversations ?? 0, icon: MessageSquareText },
    { label: 'جهات الاتصال', value: totalContacts ?? 0, icon: Users },
  ]
  const groups = [
    {
      title: 'العملاء والتواصل',
      items: [
        { href: '/dashboard/conversations', title: 'سجل المحادثات', description: 'الرسائل المفتوحة وسجل التواصل', icon: MessageSquareText },
        { href: '/dashboard/contacts', title: 'جهات الاتصال', description: 'قائمة العملاء وبيانات التواصل', icon: Users },
        { href: '/dashboard/leads', title: 'العملاء المحتملون', description: 'حالات العملاء وفرص المتابعة', icon: UserRound },
      ],
    },
    {
      title: 'العمليات',
      items: [
        { href: '/dashboard/appointments', title: 'المواعيد', description: 'الحجوزات القادمة وسجل المواعيد', icon: CalendarDays },
        { href: '/dashboard/orders', title: 'الطلبات', description: 'الطلبات وحالات الإنجاز', icon: ClipboardList },
        { href: '/dashboard/reports', title: 'التقارير المحفوظة', description: 'الجداول والتقارير التي أنشأها فريقك', icon: FileText },
      ],
    },
    {
      title: 'القنوات والنمو',
      items: [
        { href: '/dashboard/campaigns', title: 'الحملات', description: 'حالة الحملات والجمهور المستهدف', icon: Megaphone },
        { href: '/dashboard/channels', title: 'القنوات', description: 'حالة ربط وسائل التواصل', icon: RadioTower },
        { href: '/dashboard/knowledge', title: 'قاعدة المعرفة', description: 'مصادر معلومات المساعد', icon: BookOpen },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-text">التقارير والتحليلات</h1>
        <p className="mt-1 text-xs leading-5 text-text-muted">مؤشرات من بيانات مؤسستك، دون أرقام تقديرية.</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="dashboard-metric-card">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-light text-primary-dark"><Icon size={17} aria-hidden="true" /></span>
            <strong className="mt-3 block text-xl font-extrabold tabular-nums text-text">{formatNumber(value ?? 0)}</strong>
            <span className="mt-1 block text-[10px] leading-4 text-text-muted">{label}</span>
          </div>
        ))}
      </div>

      <section className="dashboard-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/35 text-primary-dark"><BarChart3 size={18} aria-hidden="true" /></span>
          <div>
            <h2 className="text-sm font-extrabold text-text">مقارنة الأداء</h2>
            <p className="text-[10px] text-text-muted">الطلبات المكتملة وقيمتها حسب عملة كل طلب</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PeriodCard title="آخر 24 ساعة" count={recentOrders.length} money={moneyLabel(recentOrders)} />
          <PeriodCard title="آخر 30 يوماً" count={orders.length} money={moneyLabel(orders)} />
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.title} className="space-y-2.5">
          <h2 className="text-sm font-extrabold text-text">{group.title}</h2>
          <div className="dashboard-card divide-y divide-border px-3">
            {group.items.map(({ href, title, description, icon: Icon }) => (
              <Link key={href} href={href} className="flex min-h-[66px] items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light/70 text-secondary"><Icon size={19} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-text">{title}</strong>
                  <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">{description}</span>
                </span>
                <ChevronLeft size={17} className="shrink-0 text-text-muted" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="text-[10px] leading-5 text-text-muted">القيم المالية معروضة بشكل منفصل لكل عملة؛ لا نجمع عملات مختلفة في إجمالي واحد.</p>
    </div>
  )
}

function PeriodCard({ title, count, money }: { title: string; count: number; money: string }) {
  return (
    <div className="rounded-2xl bg-surface-muted/70 p-3">
      <p className="text-[11px] font-bold text-text-muted">{title}</p>
      <strong className="mt-2 block text-xl font-extrabold tabular-nums text-text">{formatNumber(count)}</strong>
      <p className="mt-1 text-[10px] text-text-muted">طلبات مكتملة</p>
      <p className="mt-3 break-words text-xs font-bold leading-5 text-secondary">{money}</p>
    </div>
  )
}
