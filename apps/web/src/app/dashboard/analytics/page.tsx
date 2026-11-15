import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { formatNumber } from '@/lib/i18n/format'
import {
  MessageCircle,
  Users,
  TrendingUp,
  BrainCircuit,
  BarChart3,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/kpi-card'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()

  const [
    { count: totalConversations },
    { count: openConversations },
    { count: totalContacts },
    { count: totalLeads },
    { data: ordersData },
  ] = await Promise.all([
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId)
      .in('status', ['open', 'needs_human', 'handoff', 'active']),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    db
      .from('orders')
      .select('total_amount')
      .eq('organization_id', context.organizationId)
      .eq('status', 'completed'),
  ])

  const conversations = totalConversations ?? 0
  const open = openConversations ?? 0
  const contacts = totalContacts ?? 0
  const leads = totalLeads ?? 0
  const revenue =
    ordersData?.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0) || 0
  const hasActivity = conversations > 0 || contacts > 0 || leads > 0 || revenue > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">التحليلات</h1>
        <p className="mt-1 text-sm text-text-muted">
          مؤشرات مستمدة من بيانات حسابك فقط — بدون أرقام تقديرية.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="المحادثات"
          value={formatNumber(conversations)}
          hint={conversations === 0 ? 'بعد ربط القنوات' : undefined}
          icon={<MessageCircle className="h-4 w-4" />}
          tone="default"
        />
        <KpiCard
          label="محادثات مفتوحة"
          value={formatNumber(open)}
          hint={open === 0 ? 'لا يوجد حالياً' : undefined}
          icon={<BrainCircuit className="h-4 w-4" />}
          tone="dark"
        />
        <KpiCard
          label="جهات الاتصال"
          value={formatNumber(contacts)}
          hint={contacts === 0 ? 'تُضاف مع الرسائل' : undefined}
          icon={<Users className="h-4 w-4" />}
          tone="default"
        />
        <KpiCard
          label="إيرادات مكتملة"
          value={revenue > 0 ? formatNumber(revenue) : '—'}
          hint={revenue > 0 ? 'من الطلبات المكتملة' : 'لا طلبات مكتملة بعد'}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="gold"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <SectionHeader
          title="حجم النشاط"
          action={<span className="text-xs text-text-muted">من قاعدة بياناتك</span>}
        />
        {!hasActivity ? (
          <MobileEmptyState
            icon={<BarChart3 className="h-8 w-8" aria-hidden="true" />}
            title="لا توجد بيانات كافية بعد"
            description="ستظهر المؤشرات والمخططات هنا بعد ربط واتساب أو القنوات وبدء استقبال المحادثات."
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
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-text-muted">إجمالي المحادثات</span>
              <span className="font-semibold text-text">{formatNumber(conversations)}</span>
            </li>
            <li className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-text-muted">المحادثات المفتوحة / تحتاج متابعة</span>
              <span className="font-semibold text-text">{formatNumber(open)}</span>
            </li>
            <li className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-text-muted">العملاء المحتملون</span>
              <span className="font-semibold text-text">{formatNumber(leads)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-text-muted">جهات الاتصال</span>
              <span className="font-semibold text-text">{formatNumber(contacts)}</span>
            </li>
          </ul>
        )}
      </section>

      <p className="text-xs text-text-muted">
        مؤشرات مثل معدل الحل أو زمن الاستجابة تظهر فقط عند توفر أحداث كافية في النظام — ولن تُعرض قيم تقديرية.
      </p>
    </div>
  )
}
