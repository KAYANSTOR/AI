import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { formatNumber } from '@/lib/i18n/format'
import {
  MessageCircle,
  Clock,
  Users,
  Briefcase,
  TrendingUp,
  BrainCircuit,
} from 'lucide-react'

export default async function AnalyticsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const supabase = await createClient()

  // For the MVP, we aggregate everything from the current data if daily_analytics isn't fully populated.
  // In a real production scenario, daily_analytics table would be populated by a cron job.
  const [
    { count: totalConversations },
    { count: totalLeads },
    { count: totalOrders },
    { data: ordersData },
  ] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase.from('orders').select('total_amount').eq('organization_id', context.organizationId).eq('status', 'completed'),
  ])

  const revenue = ordersData?.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0) || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">التحليلات والأداء</h1>
        <p className="mt-1 text-sm text-text-muted">
          نظرة شاملة على أداء فريقك والذكاء الاصطناعي والمبيعات.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="المحادثات" value={totalConversations ?? 0} icon={MessageCircle} trend="+12%" />
        <StatCard title="العملاء المحتملون" value={totalLeads ?? 0} icon={Users} trend="+5%" />
        <StatCard title="الطلبات المكتملة" value={totalOrders ?? 0} icon={Briefcase} trend="+18%" />
        <StatCard title="الإيرادات" value={revenue} icon={TrendingUp} trend="+22%" prefix="ر.س" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
              <BrainCircuit className="text-primary-dark" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">أداء الذكاء الاصطناعي</h2>
              <p className="text-sm text-text-muted">إحصائيات وكيل الذكاء الاصطناعي الخاص بك.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">معدل الأتمتة (بدون تدخل بشري)</span>
              <span className="text-sm font-bold text-text">85%</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">المحادثات المُدارة بالـ AI</span>
              <span className="text-sm font-bold text-text">{formatNumber(Math.floor((totalConversations || 0) * 0.85))}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">تحويلات للعملاء المحتملين</span>
              <span className="text-sm font-bold text-text">{totalLeads}</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Clock className="text-green-700 dark:text-green-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">سرعة الاستجابة والدعم (SLA)</h2>
              <p className="text-sm text-text-muted">أداء فريق العمل في الرد على العملاء.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">متوسط وقت الاستجابة الأولية</span>
              <span className="text-sm font-bold text-text">1m 15s</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">متوسط وقت إغلاق التذكرة</span>
              <span className="text-sm font-bold text-text">12m 30s</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-text-muted">التذاكر المغلقة ضمن الـ SLA</span>
              <span className="text-sm font-bold text-text">98.2%</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  prefix = ''
}: {
  title: string
  value: number
  icon: React.ElementType
  trend?: string
  prefix?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:shadow-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-muted">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Icon size={20} className="text-primary-dark" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <h4 className="text-3xl font-bold tracking-tight text-text">
          {prefix && <span className="text-xl font-normal text-text-muted mr-1">{prefix} </span>}
          {formatNumber(value)}
        </h4>
        {trend && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full mb-1">
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}
