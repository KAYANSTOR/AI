'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Copy, ImagePlus, LoaderCircle, Wallet, X } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { KayanSelect } from '@/components/ui/kayan-select'
import { expectedYerAmount, hasTransferableAccount } from '@/lib/billing/yer-pricing'
import { mediaLimitLines, type BillingCycle, type PlanCode, type PlanLimits } from '@/lib/billing/plan-catalog'
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
  const [manualWalletId, setManualWalletId] = useState(manualWallets.find((wallet) => hasTransferableAccount(wallet.account_number))?.id ?? '')
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [manualPlanCode, setManualPlanCode] = useState<PlanCode | null>(null)
  const [senderName, setSenderName] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [manualResult, setManualResult] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  const paidPlans = planOffers
  const manualPlan = planOffers.find((plan) => plan.code === manualPlanCode)
  const manualYer = yerFor(manualPlan)
  const selectedWallet = manualWallets.find((wallet) => wallet.id === manualWalletId && hasTransferableAccount(wallet.account_number))
  const walletAvailable = configured && wallets.length > 0

  const currencies = Array.from(new Set(['USD', 'YER', ...planOffers.flatMap((plan) => Object.keys(plan.prices))]))
  function getPrice(plan: PlanOffer) {
    const selected = plan.prices[currency] ?? plan.prices.USD
    const amount = selected?.[cycle]
    if (typeof amount === 'number' && Number.isFinite(amount)) return { amount, currency }
    const usd = plan.prices.USD?.[cycle] ?? (cycle === 'yearly' ? plan.annualPrice : plan.monthlyPrice)
    const yer = currency === 'YER' ? yerFor(plan) : null
    return yer ? { amount: yer, currency: 'YER' } : { amount: usd, currency: 'USD' }
  }

  /** YER is always computable: configured YER price first, then USD × owner-console / env rate. */
  function yerFor(plan: PlanOffer | undefined): number | null {
    if (!plan) return null
    const result = expectedYerAmount({
      usdMonthly: plan.prices.USD?.monthly ?? plan.monthlyPrice,
      cycle,
      yerPrice: plan.prices.YER ? { amount: plan.prices.YER[cycle], rate: plan.prices.YER.rate } : null,
      platformRate: yerPerUsd > 0 ? yerPerUsd : null,
      envRate: null,
    })
    return result?.amountYer ?? null
  }

  function chooseReceipt(file: File | null) {
    setReceiptFile(file)
    setReceiptPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return file ? URL.createObjectURL(file) : null
    })
  }

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
  }

  function openManual(planCode: PlanCode) {
    setManualPlanCode(planCode)
    setManualError(null)
    setManualResult(null)
  }

  async function choosePlan(planCode: PlanCode) {
    if (pending) return
    if (!walletAvailable) {
      openManual(planCode)
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
    if (!manualPlanCode || !selectedWallet || !receiptFile || pending) return
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
      chooseReceipt(null)
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
        <KayanSelect
          value={currency}
          onValueChange={setCurrency}
          aria-label="العملة"
          title="عملة العرض"
          className="!min-h-11 !w-auto rounded-xl bg-background text-sm font-semibold"
          options={currencies.map((item) => ({ value: item, label: item === 'USD' ? '$ USD' : item === 'YER' ? 'ر.ي YER' : item }))}
        />
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
            <KayanSelect
              value={walletId}
              onValueChange={setWalletId}
              disabled={!wallets.length || pending}
              title="محفظة التحصيل"
              className="mt-1.5 bg-background"
              options={wallets.map((wallet) => ({
                value: wallet.id,
                label: `${wallet.provider?.display_name ?? wallet.provider?.name ?? 'محفظة'} · ${wallet.name}`,
                description: wallet.account_number ?? undefined,
              }))}
            />
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
                {mediaLimitLines(plan.limits).map((line) => (
                  <li key={line} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{line}</li>
                ))}
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
              <button type="button" onClick={() => openManual(plan.code)} disabled={pending} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-secondary)] px-3 text-xs font-bold text-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] disabled:opacity-50">
                <Wallet size={15} aria-hidden="true" />
                الدفع عبر محفظة يمنية (تحويل يدوي)
              </button>
            </article>
          )
        })}
      </div>

      <BottomSheet
        open={manualPlanCode !== null}
        onOpenChange={(next) => { if (!next) setManualPlanCode(null) }}
        title="الدفع عبر محفظة يمنية"
        description={manualPlan ? `خطة ${manualPlan.name} · ${cycle === 'yearly' ? 'سنوي' : 'شهري'}` : undefined}
        footer={
          <div className="space-y-2">
            <div role="status" aria-live="polite" className="flex justify-center empty:hidden">
              {copied ? <span className="rounded-full bg-[var(--brand-accent)] px-4 py-1.5 text-sm font-bold text-[var(--brand-secondary)] shadow-raised">تم النسخ</span> : null}
            </div>
            {manualError ? <p role="alert" className="text-sm font-medium text-error">{manualError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitManualTransfer}
                disabled={!selectedWallet || !senderName.trim() || !transferReference.trim() || !receiptFile || pending}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand-secondary)] px-4 text-sm font-bold text-[var(--brand-primary)] disabled:opacity-50"
              >
                {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
                {pending ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}
              </button>
              <button type="button" onClick={() => setManualPlanCode(null)} className="min-h-12 rounded-xl border border-border px-4 text-sm font-semibold text-text">إلغاء</button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--brand-secondary)] p-4 text-[var(--brand-primary)]">
            <p className="text-xs font-semibold opacity-80">المبلغ المطلوب تحويله</p>
            <p className="mt-1 text-2xl font-extrabold">
              {manualYer !== null ? `${manualYer.toLocaleString('en-US')} ر.ي` : 'يُحدَّد المبلغ بعد ضبط سعر الصرف'}
            </p>
            <p className="mt-1 text-xs leading-5 opacity-80">سيتم مراجعة التحويل وتفعيل اشتراكك فور مطابقة المرجع والإيصال.</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-bold text-text">اختر محفظة الاستلام</legend>
            {manualWallets.length ? (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="محفظة الاستلام">
                {manualWallets.map((wallet) => {
                  const ready = hasTransferableAccount(wallet.account_number)
                  const active = wallet.id === manualWalletId
                  return (
                    <button
                      key={wallet.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!ready}
                      onClick={() => setManualWalletId(wallet.id)}
                      className={`relative flex min-h-[64px] flex-col items-start justify-center rounded-2xl border p-3 text-start text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--brand-secondary)]' : 'border-border bg-surface text-text'}`}
                    >
                      <span className="flex items-center gap-1.5"><Wallet size={15} aria-hidden="true" />{wallet.display_name}</span>
                      <span className="mt-0.5 text-[11px] font-medium text-text-muted">{ready ? 'متاحة للتحويل' : 'رقم المحفظة قيد التحديث'}</span>
                      {active ? <Check size={16} className="absolute end-2.5 top-2.5" aria-hidden="true" /> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-surface-muted p-3 text-sm text-text-muted">لا توجد محافظ استلام مفعّلة حالياً.</p>
            )}
          </fieldset>

          {selectedWallet ? (
            <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm text-text">
              <p>اسم المستفيد: <strong>{selectedWallet.account_name}</strong></p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span dir="ltr" className="min-w-0 truncate text-lg font-extrabold tracking-wide text-[var(--brand-secondary)]">{selectedWallet.account_number}</span>
                <button
                  type="button"
                  onClick={() => copyNumber(selectedWallet.account_number)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand-secondary)] px-3 text-xs font-bold text-[var(--brand-primary)]"
                >
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied ? 'تم النسخ' : 'نسخ الرقم'}
                </button>
              </div>
              {selectedWallet.instructions ? <p className="mt-2 text-xs leading-5 text-text-muted">{selectedWallet.instructions}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text">اسم المرسل<input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={160} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-text" /></label>
            <label className="block text-sm font-medium text-text">مرجع التحويل<input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} maxLength={128} dir="ltr" className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-start text-text" /></label>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-text">صورة الإيصال</p>
            {receiptPreview ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={receiptPreview} alt="معاينة الإيصال" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{receiptFile?.name}</span>
                <button type="button" onClick={() => chooseReceipt(null)} aria-label="إزالة الإيصال" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text"><X size={16} aria-hidden="true" /></button>
              </div>
            ) : (
              <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[var(--brand-secondary)]/40 bg-surface text-center text-sm font-semibold text-[var(--brand-secondary)] hover:bg-[var(--brand-primary)]">
                <ImagePlus size={22} aria-hidden="true" />
                <span>اضغط لرفع صورة الإيصال</span>
                <span className="text-[11px] font-medium text-text-muted">JPG / PNG / WEBP حتى 2 ميغابايت</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseReceipt(event.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
        </div>
      </BottomSheet>
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
