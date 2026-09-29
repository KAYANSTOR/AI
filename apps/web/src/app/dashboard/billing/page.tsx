import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CreditCard, Zap, Phone, Radio, Workflow, Megaphone } from 'lucide-react'
import { formatNumber } from '@/lib/i18n/format'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'

export default async function BillingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const supabase = await createClient()

  const snapshot = await loadBillingSnapshot(supabase, context.organizationId)

  const meters = [
    {
      key: 'ai_messages',
      title: 'رسائل الذكاء الاصطناعي',
      hint: 'كل رد وكيل يُحسب رسالة',
      icon: Zap,
      color: 'bg-purple-500',
      used: snapshot.usage.ai_messages ?? 0,
      limit: snapshot.limits.ai_messages ?? 100,
    },
    {
      key: 'voice_minutes',
      title: 'دقائق الصوت',
      hint: 'مكالمات الوكيل الصوتي',
      icon: Phone,
      color: 'bg-blue-500',
      used: snapshot.usage.voice_minutes ?? 0,
      limit: snapshot.limits.voice_minutes ?? 30,
    },
    {
      key: 'channels',
      title: 'القنوات النشطة',
      hint: 'WhatsApp / SMS / هاتف / إنستغرام',
      icon: Radio,
      color: 'bg-emerald-500',
      used: snapshot.usage.channels ?? 0,
      limit: snapshot.limits.channels ?? 1,
    },
    {
      key: 'automation_runs',
      title: 'تشغيل الأتمتة',
      hint: 'سير العمل المنشور',
      icon: Workflow,
      color: 'bg-amber-500',
      used: snapshot.usage.automation_runs ?? 0,
      limit: snapshot.limits.automation_runs ?? 50,
    },
    {
      key: 'campaign_sends',
      title: 'إرسال الحملات',
      hint: 'رسائل الحملات التسويقية',
      icon: Megaphone,
      color: 'bg-rose-500',
      used: snapshot.usage.campaign_sends ?? 0,
      limit: snapshot.limits.campaign_sends ?? 50,
    },
  ]

  const statusLabel =
    snapshot.status === 'active'
      ? 'نشط'
      : snapshot.status === 'trial'
        ? 'تجريبي'
        : snapshot.status === 'past_due' || snapshot.status === 'grace_period'
          ? 'متأخر'
          : snapshot.status === 'suspended'
            ? 'موقوف'
            : snapshot.status

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الباقات والاستهلاك</h1>
        <p className="mt-1 text-sm text-text-muted">
          حدود الخطة تُفرض على الخادم — الواجهة تعرض الاستهلاك الفعلي فقط.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light/40">
              <CreditCard className="text-primary-dark" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-muted">الباقة الحالية</p>
              <h2 className="flex items-center gap-2 text-xl font-bold text-text">
                {snapshot.planCode}
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  {statusLabel}
                </span>
              </h2>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-text">الاستهلاك الشهري</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {meters.map((m) => {
            const percent = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0
            const Icon = m.icon
            return (
              <div key={m.key} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-background p-2 text-text">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-text">{m.title}</h4>
                      <p className="text-xs text-text-muted">{m.hint}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-text">{percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full ${percent > 90 ? 'bg-red-500' : m.color}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs font-medium text-text-muted">
                  <span>{formatNumber(m.used)} مستخدم</span>
                  <span>{formatNumber(m.limit)} كحد أقصى</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
