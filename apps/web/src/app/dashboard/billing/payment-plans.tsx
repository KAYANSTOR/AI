'use client'

import { useState, useTransition } from 'react'
import { Check, LoaderCircle, Wallet } from 'lucide-react'
import { type BillingCycle, type PlanCode, type PlanLimits } from '@/lib/billing/plan-catalog'
import type { EsaalatWallet } from '@/lib/billing/esaalat'
import { startEsaalatCheckoutAction, submitManualWalletPaymentAction } from './actions'

type ManualWallet = { id: string; provider_code: string; display_name: string; account_name: string; account_number: string; instructions: string | null }
type PlanOffer = { code: PlanCode; name: string; monthlyPrice: number; annualPrice: number; featured: boolean; limits: PlanLimits; prices: Record<string, { monthly?: number; yearly?: number; rate?: number }> }
type PaymentProvider = { code: string; display_name: string; provider_type: string; is_active: boolean }

export function PaymentPlans({
  wallets,
  configured,
  manualWallets,
  yerPerUsd,
  planOffers,
  internationalProviders,
}: {
  wallets: EsaalatWallet[]
  configured: boolean
  manualWallets: ManualWallet[]
  yerPerUsd: number
  planOffers: PlanOffer[]
  internationalProviders: PaymentProvider[]
}) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [currency, setCurrency] = useState('USD')
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [manualWalletId, setManualWalletId] = useState(manualWallets[0]?.id ?? '')
  const [manualPlanCode, setManualPlanCode] = useState<PlanCode | null>(null)
  const [senderName, setSenderName] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [manualResult, setManualResult] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  const paidPlans = planOffers
  const walletAvailable = configured && wallets.length > 0

  const currencies = Array.from(new Set(['USD', 'YER', ...planOffers.flatMap((plan) => Object.keys(plan.prices))]))
  function getPrice(plan: PlanOffer) {
    const selected = plan.prices[currency] ?? plan.prices.USD
    const amount = selected?.[cycle]
    if (typeof amount === 'number' && Number.isFinite(amount)) return { amount, currency }
    const usd = plan.prices.USD?.[cycle] ?? (cycle === 'yearly' ? plan.annualPrice : plan.monthlyPrice)
    return { amount: currency === 'YER' && yerPerUsd > 0 ? Math.round(usd * yerPerUsd) : usd, currency: currency === 'YER' && yerPerUsd > 0 ? 'YER' : 'USD' }
  }

  async function choosePlan(planCode: PlanCode) {
    if (pending) return
    if (!walletAvailable) {
      setManualPlanCode(planCode)
      setManualError(null)
      setManualResult(null)
      return
    }
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

  async function submitManualTransfer() {
    if (!manualPlanCode || !manualWalletId || !receiptFile || pending) return
    setManualError(null)
    setManualResult(null)
    const bytes = new Uint8Array(await receiptFile.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
    const receiptBase64 = window.btoa(binary)
    startTransition(async () => {
      const result = await submitManualWalletPaymentAction({
        planCode: manualPlanCode,
        billingCycle: cycle,
        walletId: manualWalletId,
        senderName,
        transferReference,
        receiptMimeType: receiptFile.type,
        receiptBase64,
      })
      if (!result.ok) {
        setManualError(result.error)
        return
      }
      setManualResult(`${result.message} المبلغ المسجل: ${result.amountYer.toLocaleString('en-US')} ر.ي.`)
      setManualPlanCode(null)
      setSenderName('')
      setTransferReference('')
      setReceiptFile(null)
    })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">اختر خطتك</h2>
          <p className="mt-1 text-sm text-text-muted">اختر العملة ودورة الفوترة، ثم تابع إلى طريقة الدفع المناسبة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-text" aria-label="العملة">
          {currencies.map((item) => <option key={item} value={item}>{item === 'USD' ? '$ USD' : item === 'YER' ? 'ر.ي YER' : item}</option>)}
        </select>
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
      ) : null}

      {!wallets.length && configured ? (
        <p className="rounded-lg bg-background px-3 py-2 text-sm text-text-muted">
          لم يُرجع حساب التاجر أي محفظة قابلة للتحصيل. فعّل مراقبة محفظة من لوحة إيصالات أولاً.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {paidPlans.map((plan) => {
          const price = getPrice(plan)
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
                {price.amount.toLocaleString('en-US')} {price.currency === 'USD' ? '$ USD' : price.currency === 'YER' ? 'ر.ي YER' : price.currency}
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
                disabled={pending}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
                المتابعة للدفع
              </button>
              {manualWallets.length > 0 ? (
                <button type="button" onClick={() => { setManualPlanCode(plan.code); setManualError(null); setManualResult(null) }} disabled={pending} className="mt-2 min-h-10 w-full rounded-xl border border-border px-3 text-xs font-semibold text-text-muted disabled:opacity-50">
                  أرسلت تحويلًا لمحفظة يمنية؟ أرفق الإيصال
                </button>
              ) : null}
            </article>
          )
        })}
      </div>

      {manualPlanCode ? (
        <div className="sticky bottom-0 z-50 space-y-4 rounded-xl border border-secondary/30 bg-background p-4 pb-24 shadow-raised">
          <div>
            <h3 className="font-bold text-text">إرسال إثبات تحويل يدوي</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted">لن يتفعّل الاشتراك إلا بعد مراجعة المرجع والمبلغ والإيصال في لوحة Kayan AI Admin.</p>
            <p className="mt-1 text-sm font-bold text-text">المبلغ المتوقع: {Math.round((planOffers.find((plan) => plan.code === manualPlanCode)?.monthlyPrice ?? 0) * (cycle === 'yearly' ? 10 : 1) * yerPerUsd).toLocaleString('en-US')} ر.ي.</p>
          </div>
          <label className="block text-sm font-medium text-text">محفظة الاستلام
            <select value={manualWalletId} onChange={(event) => setManualWalletId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-text">
              {manualWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.display_name} · {wallet.account_number}</option>)}
            </select>
          </label>
          {manualWallets.find((wallet) => wallet.id === manualWalletId) ? (
            <div className="rounded-lg bg-surface p-3 text-sm text-text">
              <p>اسم المستفيد: <strong>{manualWallets.find((wallet) => wallet.id === manualWalletId)?.account_name}</strong></p>
              <p dir="ltr" className="mt-1 text-start">{manualWallets.find((wallet) => wallet.id === manualWalletId)?.account_number}</p>
              {manualWallets.find((wallet) => wallet.id === manualWalletId)?.instructions ? <p className="mt-2 text-xs text-text-muted">{manualWallets.find((wallet) => wallet.id === manualWalletId)?.instructions}</p> : null}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text">اسم المرسل<input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={160} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3" /></label>
            <label className="block text-sm font-medium text-text">مرجع التحويل<input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} maxLength={128} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3" /></label>
          </div>
          <label className="block text-sm font-medium text-text">صورة الإيصال (JPG / PNG / WEBP، حتى 2 ميغابايت)
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-sm text-text" />
          </label>
          {manualError ? <p role="alert" className="text-sm text-error">{manualError}</p> : null}
          <div className="flex gap-2"><button type="button" onClick={submitManualTransfer} disabled={!manualWalletId || !senderName.trim() || !transferReference.trim() || !receiptFile || pending} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{pending ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}</button><button type="button" onClick={() => setManualPlanCode(null)} className="min-h-11 rounded-xl border border-border px-4 text-sm">إلغاء</button></div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm font-medium text-error">{error}</p> : null}
      {manualResult ? <p role="status" className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-text">{manualResult}</p> : null}
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-text">
        <p className="font-semibold">الدفع الدولي والعربي</p>
        <p className="mt-1 text-text-muted">{internationalProviders.length ? 'ستظهر بوابة الدفع المفعّلة هنا عند جاهزيتها.' : 'بوابة البطاقات غير مفعّلة حالياً. تواصل معنا لطلب تفعيل دولي أو اختر التحويل اليدوي.'}</p>
      </div>
      <p className="text-xs leading-6 text-text-muted">
        يتم تفعيل الاشتراك تلقائياً بعد تأكيد التحويل ومطابقة المحفظة والمرجع والمبلغ. لا تعتمد المنصة على صورة التحويل وحدها.
      </p>
    </section>
  )
}
