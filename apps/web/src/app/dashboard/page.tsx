import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { DashboardKpiSection, DashboardKpiSkeleton } from '@/components/dashboard/overview/dashboard-kpi-section'
import { HomeServicesGrid } from '@/components/dashboard/overview/home-services-grid'
import { DashboardActivitySection, DashboardActivitySkeleton } from '@/components/dashboard/overview/dashboard-activity-section'
import { DashboardAgentHealthSection, DashboardAgentHealthSkeleton } from '@/components/dashboard/overview/dashboard-agent-health-section'
import Link from 'next/link'
import { Brain, ListTodo, MessageCircle, Plug } from 'lucide-react'
import { isPersonalWorkspace } from '@/lib/dashboard/navigation-policy'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  if (isPersonalWorkspace(context)) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h1 className="text-xl font-extrabold text-text">مساعدك الشخصي</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">ابدأ محادثة، اطلب تنظيم مهامك، أو راجع ما يتذكره مساعدك.</p>
          <Link href={context.personalAssistantEnabled ? '/dashboard/assistant' : '/dashboard/billing'} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-dark px-4 font-bold text-primary-dark-foreground">
            <MessageCircle size={19} aria-hidden /> {context.personalAssistantEnabled ? 'ابدأ محادثة' : 'راجع باقتك'}
          </Link>
        </section>
        {context.personalAssistantEnabled && <section aria-label="أدواتك الشخصية" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href="/dashboard/assistant/tasks" className="dashboard-service-card"><ListTodo size={20} aria-hidden /><span className="font-bold text-text">المهام والتذكيرات</span></Link>
          <Link href="/dashboard/assistant?tab=memory" className="dashboard-service-card"><Brain size={20} aria-hidden /><span className="font-bold text-text">الذاكرة الشخصية</span></Link>
          <Link href="/dashboard/assistant?tab=tools" className="dashboard-service-card"><Plug size={20} aria-hidden /><span className="font-bold text-text">الأدوات المتصلة</span></Link>
        </section>}
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardKpiSkeleton />}>
        <DashboardKpiSection organizationId={context.organizationId} />
      </Suspense>
      <HomeServicesGrid enabledCapabilities={context.enabledCapabilities} />
      {context.personalAssistantEnabled ? (
      <section className="rounded-2xl border border-secondary/30 bg-gradient-to-br from-primary-dark to-primary p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-white/75">مساحتك الخاصة</p>
            <h2 className="mt-1 text-xl font-extrabold">المساعد الشخصي</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-white/80">احتفظ بذاكرتك ومهامك وملخصك اليومي بعيداً عن بيانات نشاطك التجاري.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/assistant" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary-dark hover:bg-white/90"><ListTodo size={16} /> افتح المساعد</Link>
            <Link href="/dashboard/assistant?tab=memory" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"><Brain size={16} /> الذاكرة</Link>
          </div>
        </div>
      </section>
      ) : null}
      <Suspense fallback={<DashboardActivitySkeleton />}>
        <DashboardActivitySection organizationId={context.organizationId} timezone={context.timezone} />
      </Suspense>
      <Suspense fallback={<DashboardAgentHealthSkeleton />}>
        <DashboardAgentHealthSection organizationId={context.organizationId} enabledCapabilities={context.enabledCapabilities} />
      </Suspense>
    </div>
  )
}
