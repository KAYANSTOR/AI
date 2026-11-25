import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, Check, Lock } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { canUseBusinessExecutiveAgent, organizationAgentKind } from '@/lib/personal-assistant/executive/specialized-agents'

export const dynamic = 'force-dynamic'

const BENEFITS = [
  'مساعد تنفيذي على واتساب عبر رقم Kayan AI المركزي',
  'محضر أعمال لكل مهمة وبوابة موافقة مشفّرة قبل أي إجراء حساس',
  'ذاكرة شفافة تعدّلها وتحذفها بنفسك',
]

/** Every /dashboard/assistant/* route is gated by the sector or the add-on. */
export default async function PersonalAssistantLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  if (context.personalAssistantEnabled) return <>{children}</>
  if (canUseBusinessExecutiveAgent(await organizationAgentKind(await createClient(), context.organizationId), context.role)) return <>{children}</>
  return (
    <section dir="rtl" aria-labelledby="pa-upgrade-title" className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <div className="bg-primary-dark p-6 text-primary">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-primary-dark"><Lock size={13} aria-hidden /> إضافة مدفوعة</span>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-dark"><Bot size={24} aria-hidden /></span>
          <div>
            <h1 id="pa-upgrade-title" className="text-xl font-extrabold">المساعد الشخصي Add-on</h1>
            <p className="mt-0.5 text-sm text-primary/80">غير مفعّل في باقتك الحالية</p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <ul className="space-y-2.5">
          {BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm leading-6 text-text"><Check size={16} className="mt-1 shrink-0 text-success" aria-hidden />{item}</li>
          ))}
        </ul>
        <Link href="/dashboard/billing" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-extrabold text-primary-dark transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus">
          فعّل الإضافة من الباقات
        </Link>
        <p className="text-center text-xs text-text-muted">بيانات نشاطك التجاري لا تتأثر بتفعيل المساعد الشخصي.</p>
      </div>
    </section>
  )
}
