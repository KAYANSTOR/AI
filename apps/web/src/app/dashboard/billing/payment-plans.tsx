'use client'

import { useState, useTransition } from 'react'
import { Check, LoaderCircle, Wallet } from 'lucide-react'
import { PLAN_CATALOG, type BillingCycle, type PlanCode } from '@/lib/billing/plan-catalog'
import type { EsaalatWallet } from '@/lib/billing/esaalat'
import { startEsaalatCheckoutAction } from './actions'

export function PaymentPlans({
  wallets,
  configured,
  canManage,
}: {
  wallets: EsaalatWallet[]
  configured: boolean
  canManage: boolean
}) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const paidPlans = PLAN_CATALOG.filter((plan) => plan.code !== 'trial')
  const walletAvailable = configured && wallets.length > 0

  async function choosePlan(planCode: PlanCode) {
    if (!walletAvailable || pending) return
    setError(null)
    startTransition(async () => {
      const result = await startEsaalatCheckoutAction({
        planCode,
        billingCycle: cycle,
        walletId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.assign(result.url)
    })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">اختر خطتك</h2>
          <p className="mt-1 text-sm text-text-muted">الأسعار بالدولار، ويُحصّل المبلغ بالريال اليمني وفق سعر الصرف المعتمد لحساب التاجر.</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-background p-1" aria-label="دورة الفوترة">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${cycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-text-muted'}`}
            aria-pressed={cycle === 'monthly'}
          >
            شهري
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${cycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-text-muted'}`}
            aria-pressed={cycle === 'yearly'}
          >
            سنوي · شهران مجاناً
          </button>
        </div>
      </div>

      {configured ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm font-medium text-text">
            محفظة التحصيل
            <select
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
              disabled={!wallets.length || pending}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text disabled:opacity-60"
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.provider?.display_name ?? wallet.provider?.name ?? 'محفظة'} · {wallet.name}
                  {wallet.account_number ? ` · ${wallet.account_number}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Wallet size={16} />
            <span>تظهر المحافظ النشطة التي يراقبها تطبيق إيصالات فقط.</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-text">
          <p className="font-semibold">الدفع بالمحافظ لم يُفعّل بعد.</p>
          <p className="mt-1 text-text-muted">يلزم إضافة مفاتيح حساب التاجر، مفتاح Webhook، سعر الصرف، وتفعيل محفظة مراقبة على هاتف التاجر.</p>
        </div>
      )}

      {!wallets.length && configured ? (
        <p className="rounded-lg bg-background px-3 py-2 text-sm text-text-muted">
          لم يُرجع حساب التاجر أي محفظة قابلة للتحصيل. فعّل مراقبة محفظة من لوحة إيصالات أولاً.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {paidPlans.map((plan) => {
          const price = cycle === 'yearly' ? plan.annualPrice : plan.monthlyPrice
          return (
            <article
              key={plan.code}
              className={`flex flex-col rounded-xl border p-4 ${plan.featured ? 'border-accent bg-accent/5 shadow-card' : 'border-border bg-background'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-text">{plan.name}</h3>
                {plan.featured ? <span className="rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground">الأكثر اختياراً</span> : null}
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-text">
                ${price}
                <span className="ms-1 text-xs font-medium text-text-muted">{cycle === 'yearly' ? '/ سنة' : '/ شهر'}</span>
              </p>
              {cycle === 'yearly' ? (
                <p className="mt-1 text-xs text-text-muted">يعادل ${(plan.annualPrice / 12).toFixed(2)} شهرياً · تدفع قيمة 10 أشهر</p>
              ) : null}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-text-muted">
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{plan.limits.ai_messages.toLocaleString('en-US')} رد ذكي شهرياً</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{plan.limits.channels} قنوات نشطة</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{plan.limits.automation_runs.toLocaleString('en-US')} تشغيل أتمتة</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{plan.limits.campaign_sends.toLocaleString('en-US')} إرسال حملة</li>
              </ul>
              <button
                type="button"
                onClick={() => choosePlan(plan.code)}
                disabled={!canManage || !walletAvailable || !walletId || pending}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
                {canManage ? 'المتابعة للدفع' : 'متاح لمالك الحساب'}
              </button>
            </article>
          )
        })}
      </div>

      {error ? <p role="alert" className="text-sm font-medium text-error">{error}</p> : null}
      <p className="text-xs leading-6 text-text-muted">
        يتم تفعيل الاشتراك تلقائياً بعد تأكيد التحويل ومطابقة المحفظة والمرجع والمبلغ. لا تعتمد المنصة على صورة التحويل وحدها.
      </p>
    </section>
  )
}
