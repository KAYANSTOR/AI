import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bot, Brain, CheckCircle2, ClipboardList, Clock3, CreditCard, MessageCircle, Plug, ShieldCheck, Sun } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import type { DashboardContext } from '@/lib/dashboard/context'
import { loadPersonalOverview } from '@/lib/dashboard/personal-overview'
import { formatDateTime, formatNumber } from '@/lib/i18n/format'
import { SectionHeader } from '@/components/ui/section-header'
import { MobileEmptyState } from '@/components/ui/empty-state'

const tools = [
  { href: '/dashboard/assistant/tasks', title: 'المهام والتذكيرات', description: 'نظّم يومك ومواعيدك', icon: ClipboardList },
  { href: '/dashboard/assistant?tab=memory', title: 'الذاكرة الشخصية', description: 'راجع ما يتذكره مساعدك', icon: Brain },
  { href: '/dashboard/assistant?tab=tools', title: 'الموصلات والخزنة', description: 'إدارة أدواتك المتصلة', icon: Plug },
  { href: '/dashboard/assistant?tab=tasks', title: 'المهام التنفيذية', description: 'الموافقات ومحاضر التنفيذ', icon: CheckCircle2 },
  { href: '/dashboard/assistant/tasks#daily-summary', title: 'الملخص اليومي', description: 'اضبط تذكيراتك وملخصك', icon: Sun },
  { href: '/dashboard/billing', title: 'الباقات', description: 'خطتك وحدود الاستخدام', icon: CreditCard },
] as const

function Metric({ icon, title, count }: { icon: ReactNode; title: string; count: number | null }) {
  return <div className="rounded-2xl border border-border bg-surface p-3 text-center shadow-sm">
    <span className="flex items-center justify-center gap-1.5 text-text-muted">{icon}<span className="text-[11px] leading-4">{title}</span></span>
    <strong className="mt-2 block text-lg font-extrabold tabular-nums text-text">{count === null ? '—' : formatNumber(count)}</strong>
  </div>
}

async function PersonalActivity({ context }: { context: DashboardContext }) {
  const db = await createClient()
  const { open, completed, memories, tasks } = await loadPersonalOverview(db, { organizationId: context.organizationId, userId: context.userId })
  const incomplete = open === null || completed === null || memories === null
  return <>
    <section aria-label="ملخصك الشخصي" className="grid grid-cols-3 gap-2">
      <Metric icon={<Clock3 size={15} aria-hidden />} title="مهام مفتوحة" count={open} />
      <Metric icon={<CheckCircle2 size={15} aria-hidden />} title="مهام مكتملة" count={completed} />
      <Metric icon={<Brain size={15} aria-hidden />} title="عناصر الذاكرة" count={memories} />
      {incomplete && <p role="status" className="col-span-3 text-xs leading-5 text-text-muted">تعذّر تحميل بعض المؤشرات. الرمز — يعني أن البيانات غير متاحة.</p>}
    </section>
    <section className="space-y-3" aria-label="مهام تحتاج متابعة">
      <SectionHeader title="مهام تحتاج متابعة" action="عرض الكل" actionHref="/dashboard/assistant/tasks" />
      {tasks === null ? <p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm text-error">تعذّر تحميل مهامك. يمكنك إعادة المحاولة من صفحة المهام.</p> :
        tasks.length === 0 ? <MobileEmptyState icon={<ClipboardList size={30} aria-hidden />} title="لا توجد مهام مفتوحة" description="ابدأ بتنظيم يومك بإضافة مهمة أو اطلب من مساعدك إنشاء تذكير." action={<Link href="/dashboard/assistant/tasks" className="inline-flex min-h-11 items-center rounded-xl bg-primary-dark px-4 text-sm font-bold text-primary-dark-foreground">إضافة مهمة</Link>} /> :
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {tasks.map(task => <li key={task.id} className="flex items-center gap-3 p-3.5">
            <span className="dashboard-service-icon shrink-0"><Clock3 size={18} aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p dir="auto" className="break-words text-sm font-bold text-text">{task.title}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{task.due_at ? formatDateTime(task.due_at, context.timezone) : 'بدون موعد محدد'}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-surface-muted px-2 py-1 text-xs text-text-muted">{task.status === 'snoozed' ? 'مؤجلة' : 'مفتوحة'}</span>
          </li>)}
        </ul>}
    </section>
  </>
}

function ActivitySkeleton() {
  return <div role="status" aria-label="جارٍ تحميل ملخصك" className="space-y-3">
    <div className="grid grid-cols-3 gap-2 motion-safe:animate-pulse">{[1, 2, 3].map(n => <div key={n} className="h-20 rounded-2xl bg-surface-muted" />)}</div>
    <div className="h-24 rounded-2xl bg-surface-muted motion-safe:animate-pulse" />
  </div>
}

export function PersonalDashboardOverview({ context }: { context: DashboardContext }) {
  const enabled = context.personalAssistantEnabled
  return <div className="space-y-6">
    <section className="dashboard-kpi-hero" aria-labelledby="personal-home-title">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary/85">مساحتك الخاصة · Kayan AI</p>
          <h1 id="personal-home-title" className="mt-2 text-2xl font-extrabold leading-tight text-primary">مساعدك الشخصي</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-primary/85">نظّم أفكارك ومهامك وتابع أعمالك من مكان واحد.</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary-dark shadow-sm"><Bot size={25} aria-hidden /></span>
      </div>
      <Link href={enabled ? '/dashboard/assistant' : '/dashboard/billing'} className="relative z-10 mt-5 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-accent px-4 text-sm font-extrabold text-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus">
        <span className="flex items-center gap-2"><MessageCircle size={19} aria-hidden />{enabled ? 'ابدأ محادثة مع مساعدك' : 'راجع باقتك لتفعيل المساعد'}</span><ArrowLeft size={18} aria-hidden />
      </Link>
      <p className="relative z-10 mt-4 flex items-center gap-2 text-xs leading-5 text-primary/80"><ShieldCheck size={15} className="shrink-0" aria-hidden />مهامك وذاكرتك الشخصية معزولة عن بيانات النشاط التجاري.</p>
    </section>
    {enabled && <>
      <section className="space-y-3">
        <SectionHeader title="أدواتك الشخصية" />
        <p className="text-xs leading-5 text-text-muted">اختر ما تريد إنجازه، وتابع باقي أعمالك من المساعد.</p>
        <div className="grid grid-cols-3 gap-2.5">
          {tools.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="dashboard-service-card !aspect-auto min-h-[110px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus">
            <span className="dashboard-service-icon"><Icon size={20} aria-hidden /></span>
            <span className="text-xs font-extrabold leading-5 text-text">{title}</span>
            <span className="text-[10px] leading-4 text-text-muted">{description}</span>
          </Link>)}
        </div>
      </section>
      <Suspense fallback={<ActivitySkeleton />}><PersonalActivity context={context} /></Suspense>
    </>}
  </div>
}
