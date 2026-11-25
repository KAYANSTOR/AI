import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CreditCard, Zap, Radio, Workflow, Megaphone } from 'lucide-react'
import { formatDateTime, formatNumber } from '@/lib/i18n/format'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import { isEsaalatPaymentConfigured, listEsaalatReceivingWallets } from '@/lib/billing/esaalat'
import type { EsaalatWallet } from '@/lib/billing/esaalat'
import { PaymentPlans } from './payment-plans'
import { createAdminClient } from '@/lib/db/admin'
import { envYerRate, loadPlatformYerRate } from '@/lib/billing/yer-pricing'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()

  const [creditWallet, creditLedger] = await Promise.all([
    db.from('org_credit_wallets').select('balance').eq('org_id', context.organizationId).maybeSingle(),
    db.from('credit_ledger_entries').select('id, delta, balance_after, created_at').eq('org_id', context.organizationId)
      .order('created_at', { ascending: false }).limit(25),
  ])

  const snapshot = await loadBillingSnapshot(db, context.organizationId)
  const { data: planRows } = await db.from('plans').select('id,code,name,monthly_price,limits,is_active')
    .in('code', ['starter', 'growth', 'pro'])
  const { data: priceRows } = await db.from('plan_prices')
    .select('plan_id,billing_cycle,currency,amount,exchange_rate_to_usd,is_active')
    .eq('is_active', true)
  const { data: providerRows } = await db.from('billing_payment_providers')
    .select('code,display_name,provider_type,is_active')
    .eq('is_active', true)
  const planOffers = PLAN_CATALOG.filter((plan) => plan.code !== 'trial').flatMap((fallback) => {
    const row = (planRows ?? []).find((item) => item.code === fallback.code)
    if (!row || row.is_active !== true) return []
    const limits = (row.limits ?? {}) as Partial<typeof fallback.limits>
    const monthlyPrice = Number(row.monthly_price)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return []
    const prices = (priceRows ?? []).filter((item) => item.plan_id === row.id)
      .reduce<Record<string, { monthly?: number; yearly?: number; rate?: number }>>((acc, item) => {
        const current = acc[String(item.currency)] ?? {}
        current[item.billing_cycle === 'yearly' ? 'yearly' : 'monthly'] = Number(item.amount)
        current.rate = Number(item.exchange_rate_to_usd) || current.rate
        acc[String(item.currency)] = current
        return acc
      }, { USD: { monthly: monthlyPrice, yearly: monthlyPrice * 10 } })
    return [{ ...fallback, name: String(row.name || fallback.name), monthlyPrice, annualPrice: monthlyPrice * 10, prices, limits: { ...fallback.limits, ...limits } }]
  })
  const currentPlan = planOffers.find((plan) => plan.code === snapshot.planCode) ?? PLAN_CATALOG.find((plan) => plan.code === snapshot.planCode)
  const walletCheckoutConfigured = isEsaalatPaymentConfigured()
  const { data: manualWalletRows } = await db.from('manual_yemen_wallets')
    .select('id,provider_code,display_name,account_name,account_number,instructions')
    .eq('is_active', true).order('sort_order').order('display_name')
  const manualWallets = (manualWalletRows ?? []) as Array<{
    id: string; provider_code: string; display_name: string; account_name: string; account_number: string; instructions: string | null
  }>
  // Owner-console rate first, env fallback; per-plan YER prices still win in the client.
  const yerPerUsd = (await loadPlatformYerRate(createAdminClient())) ?? envYerRate() ?? 0
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
      limit: snapshot.limits.ai_messages ?? 40,
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
        <h2 className="mb-3 text-lg font-bold text-primary-dark">رصيد المهام</h2>
        <div className="space-y-2 rounded-2xl border border-primary bg-white p-4 text-primary-dark">
          {creditWallet.error || creditLedger.error ? <p role="alert">تعذّر تحميل الرصيد.</p> : <>
            <p className="text-xl font-bold">{formatNumber(Number(creditWallet.data?.balance ?? 0))} رصيد متاح</p>
            <p className="text-sm">يُخصم رصيد واحد لكل خطوة بعد الخطوتين الأوليين في مهمة الوكيل المتخصص.</p>
            <h3 className="mt-3 font-bold">آخر حركات الرصيد</h3>
            {(creditLedger.data ?? []).length === 0 ? <p className="text-sm">لا توجد حركات رصيد.</p> : (
              <ul className="divide-y divide-primary">
                {(creditLedger.data ?? []).map(entry => (
                  <li key={String(entry.id)} className="flex flex-wrap justify-between gap-1 py-2 text-sm">
                    <span>{Number(entry.delta) > 0 ? 'شحن' : 'استهلاك مهمة'} · {formatNumber(Math.abs(Number(entry.delta)))}</span>
                    <span>{formatDateTime(String(entry.created_at), context.timezone)} · الرصيد {formatNumber(Number(entry.balance_after))}</span>
                  </li>
                ))}
              </ul>
            )}
          </>}
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

      <PaymentPlans wallets={wallets} configured={walletCheckoutConfigured} manualWallets={manualWallets} yerPerUsd={yerPerUsd} planOffers={planOffers} internationalProviders={(providerRows ?? []).filter((provider) => provider.provider_type !== 'manual_wallet')} />
    </div>
  )
}
