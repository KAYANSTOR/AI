import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CreditCard, Zap, Radio, Workflow, Megaphone } from 'lucide-react'
import { formatNumber } from '@/lib/i18n/format'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import { isEsaalatPaymentConfigured, listEsaalatReceivingWallets } from '@/lib/billing/esaalat'
import type { EsaalatWallet } from '@/lib/billing/esaalat'
import { PaymentPlans } from './payment-plans'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()

  const snapshot = await loadBillingSnapshot(db, context.organizationId)
  const canManage = context.role === 'owner' || context.role === 'admin'
  const { data: planRows } = await db.from('plans').select('code,name,monthly_price,limits,is_active')
    .in('code', ['starter', 'growth', 'pro'])
  const planOffers = PLAN_CATALOG.filter((plan) => plan.code !== 'trial').flatMap((fallback) => {
    const row = (planRows ?? []).find((item) => item.code === fallback.code)
    if (!row || row.is_active !== true) return []
    const limits = (row.limits ?? {}) as Partial<typeof fallback.limits>
    const monthlyPrice = Number(row.monthly_price)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return []
    return [{ ...fallback, name: String(row.name || fallback.name), monthlyPrice, annualPrice: monthlyPrice * 10, limits: { ...fallback.limits, ...limits } }]
  })
  const currentPlan = planOffers.find((plan) => plan.code === snapshot.planCode) ?? PLAN_CATALOG.find((plan) => plan.code === snapshot.planCode)
  const walletCheckoutConfigured = isEsaalatPaymentConfigured()
  const { data: manualWalletRows } = await db.from('manual_yemen_wallets')
    .select('id,provider_code,display_name,account_name,account_number,instructions')
    .eq('is_active', true).order('display_name')
  const manualWallets = (manualWalletRows ?? []) as Array<{
    id: string; provider_code: string; display_name: string; account_name: string; account_number: string; instructions: string | null
  }>
  const yerPerUsd = Number(process.env.YER_PER_USD) || 0
  let wallets: EsaalatWallet[] = []

  if (walletCheckoutConfigured) {
    try {
      wallets = await listEsaalatReceivingWallets()
    } catch {
      // The page stays usable; payment checkout remains unavailable without live wallet data.
    }
  }

  const meters = [
    {
      key: 'ai_messages',
      title: 'ردود الذكاء الاصطناعي',
      hint: 'كل رد صادر من الوكيل يُحسب ضمن الاستخدام',
      icon: Zap,
      color: 'bg-accent',
      used: snapshot.usage.ai_messages ?? 0,
      limit: snapshot.limits.ai_messages ?? 100,
    },
    {
      key: 'channels',
      title: 'القنوات النشطة',
      hint: 'عدد القنوات المتصلة والمفعّلة',
      icon: Radio,
      color: 'bg-primary',
      used: snapshot.usage.channels ?? 0,
      limit: snapshot.limits.channels ?? 1,
    },
    {
      key: 'automation_runs',
      title: 'تشغيل الأتمتة',
      hint: 'مرات تنفيذ التدفقات',
      icon: Workflow,
      color: 'bg-accent/70',
      used: snapshot.usage.automation_runs ?? 0,
      limit: snapshot.limits.automation_runs ?? 50,
    },
    {
      key: 'campaign_sends',
      title: 'إرسال الحملات',
      hint: 'إرسالات الحملات التسويقية',
      icon: Megaphone,
      color: 'bg-secondary/70',
      used: snapshot.usage.campaign_sends ?? 0,
      limit: snapshot.limits.campaign_sends ?? 50,
    },
  ]

  const statusLabel =
    snapshot.status === 'active'
      ? 'نشط'
      : snapshot.status === 'trial'
        ? 'مجاني'
        : snapshot.status === 'past_due' || snapshot.status === 'grace_period'
          ? 'متأخر'
          : snapshot.status === 'suspended'
            ? 'موقوف'
            : snapshot.status

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الخطط والاشتراك</h1>
        <p className="mt-1 text-sm text-text-muted">
          راجع باقتك الحالية واستهلاكك، ثم اختر الخطة وطريقة السداد المناسبة.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light/50">
              <CreditCard className="text-secondary" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-muted">الباقة الحالية</p>
              <h2 className="flex items-center gap-2 text-xl font-bold text-text">
                {currentPlan?.name ?? snapshot.planCode}
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
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
          {meters.map((meter) => {
            const percent = meter.limit > 0 ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0
            const Icon = meter.icon
            return (
              <div key={meter.key} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-background p-2 text-text">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-text">{meter.title}</h4>
                      <p className="text-xs text-text-muted">{meter.hint}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-text">{percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full ${percent > 90 ? 'bg-error' : meter.color}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs font-medium text-text-muted">
                  <span>{formatNumber(meter.used)} مستخدم</span>
                  <span>{formatNumber(meter.limit)} كحد أقصى</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <PaymentPlans wallets={wallets} configured={walletCheckoutConfigured} canManage={canManage} manualWallets={manualWallets} yerPerUsd={yerPerUsd} planOffers={planOffers} />
    </div>
  )
}
