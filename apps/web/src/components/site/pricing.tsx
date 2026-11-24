'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, CheckCircle2, Minus, Wallet } from 'lucide-react'
import { mediaLimitLines, type BillingCycle } from '@/lib/billing/plan-catalog'
import {
  CURRENCY_LABELS,
  formatPlanPrice,
  resolvePlanPrice,
  staticPublicPricing,
  type PublicPricing,
} from '@/lib/billing/public-pricing'

const METRICS = [
  { key: 'ai_messages', label: 'ردود الذكاء الاصطناعي شهرياً' },
  { key: 'channels', label: 'القنوات النشطة' },
  { key: 'automation_runs', label: 'تشغيلات الأتمتة شهرياً' },
  { key: 'campaign_sends', label: 'إرسالات الحملات شهرياً' },
] as const

const FEATURE_COMPARISON: { label: string; codes: string[] | 'all' }[] = [
  { label: 'قاعدة المعرفة والحجز', codes: 'all' },
  { label: 'أولوية الدعم', codes: ['growth', 'pro'] },
  { label: 'الفروع وواجهة API', codes: ['pro'] },
]

export function Pricing({ pricing = staticPublicPricing() }: { pricing?: PublicPricing }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [currency, setCurrency] = useState<string>(pricing.defaultCurrency)
  const PLAN_CATALOG = pricing.plans
  const priceLabel = (value: number | null) => formatPlanPrice(value, currency)

  return (
    <section id="pricing" className="bg-background px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold text-secondary">خطط KAYAN AI</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-text sm:text-4xl">خطط مرنة تنمو مع أعمالك</h2>
          <p className="mt-4 text-base leading-8 text-text-muted">رسائل غير محدودة في كل الباقات — الردود الفورية والأتمتة مجانية، والعدّاد الوحيد هو رد الذكاء الاصطناعي.</p>
          <div className="mt-7 inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
            <button type="button" onClick={() => setCycle('monthly')} aria-pressed={cycle === 'monthly'} className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${cycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text'}`}>شهري</button>
            <button type="button" onClick={() => setCycle('yearly')} aria-pressed={cycle === 'yearly'} className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${cycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text'}`}>سنوي · شهران مجاناً</button>
          </div>
          {pricing.currencies.length > 1 ? (
            <div className="mt-4 flex justify-center">
              <div role="group" aria-label="عملة العرض" className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
                {pricing.currencies.map((code) => (
                  <button key={code} type="button" onClick={() => setCurrency(code)} aria-pressed={currency === code} title={CURRENCY_LABELS[code] ?? code} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold transition ${currency === code ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text'}`}>{code}</button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_CATALOG.map((plan) => {
            const monthlyPrice = resolvePlanPrice(plan, currency, 'monthly')
            const annualPrice = resolvePlanPrice(plan, currency, 'yearly')
            const selectedPrice = cycle === 'yearly' ? annualPrice : monthlyPrice
            return (
              <article key={plan.code} className={`relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card transition-shadow hover:shadow-raised ${plan.featured ? 'border-accent ring-1 ring-accent' : 'border-border'}`}>
                {plan.featured ? <span className="absolute -top-3 start-6 rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-accent-foreground">الأكثر طلباً</span> : null}
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.nameEn}</p>
                <h3 className="mt-2 text-xl font-extrabold text-text">{plan.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-text-muted">{plan.description}</p>
                <div className="mt-5 flex items-baseline gap-2"><span className="text-4xl font-extrabold tracking-tight text-text">{priceLabel(selectedPrice)}</span>{selectedPrice !== null && selectedPrice > 0 ? <span className="text-sm text-text-muted">{cycle === 'yearly' ? 'للسنة' : 'للشهر'}</span> : null}</div>
                {cycle === 'yearly' && annualPrice !== null && annualPrice > 0 ? <p className="mt-1 text-xs text-text-muted">يعادل {priceLabel(Math.round((annualPrice / 12) * 100) / 100)} شهرياً عند الدفع السنوي</p> : <p className="mt-1 text-xs text-text-muted">{monthlyPrice === 0 ? 'بدون رسوم اشتراك' : monthlyPrice === null ? `غير متاح بعملة ${currency}` : 'اشتراك شهري قابل للتجديد'}</p>}
                <div className="mt-6 flex-1 border-t border-border pt-5"><p className="mb-3 text-xs font-bold text-text">حدود الخطة</p><ul className="space-y-3 text-sm text-text-muted"><li className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-success" />{plan.limits.ai_messages.toLocaleString('en-US')} رد ذكي شهرياً</li><li className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-success" />{plan.limits.channels} قنوات نشطة</li><li className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-success" />{plan.limits.automation_runs.toLocaleString('en-US')} تشغيل أتمتة شهرياً</li><li className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-success" />{plan.limits.campaign_sends.toLocaleString('en-US')} إرسال حملة شهرياً</li>{mediaLimitLines(plan.limits).map((line) => <li key={line} className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-success" />{line}</li>)}</ul></div>
                <Link href="/signup" className={`mt-7 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${plan.featured ? 'bg-primary text-primary-foreground hover:bg-primary-dark' : 'border border-border-strong bg-background text-text hover:border-primary hover:bg-primary-light/30'}`}>{monthlyPrice === 0 ? 'ابدأ مجاناً' : 'إنشاء حساب واختيار الخطة'}</Link>
              </article>
            )
          })}
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="border-b border-border px-5 py-4 sm:px-6"><details open><summary className="cursor-pointer list-none text-lg font-bold text-text [&::-webkit-details-marker]:hidden">مقارنة كل المزايا</summary><p className="mt-1 text-sm text-text-muted">مقارنة شفافة للمزايا والحدود الفعلية لكل خطة.</p></details></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm"><thead className="bg-background text-text"><tr><th className="px-5 py-4 text-start font-bold">الميزة</th>{PLAN_CATALOG.map((plan) => <th key={plan.code} className="px-4 py-4 text-center font-bold">{plan.name}</th>)}</tr></thead><tbody>
            {METRICS.map((metric) => <tr key={metric.key} className="border-t border-border"><th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">{metric.label}</th>{PLAN_CATALOG.map((plan) => <td key={plan.code} className="px-4 py-4 text-center font-semibold tabular-nums text-text">{plan.limits[metric.key].toLocaleString('en-US')}</td>)}</tr>)}
            {FEATURE_COMPARISON.map((feature) => <tr key={feature.label} className="border-t border-border"><th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">{feature.label}</th>{PLAN_CATALOG.map((plan) => feature.codes === 'all' || feature.codes.includes(plan.code)).map((value, index) => <td key={`${feature.label}-${index}`} className="px-4 py-4 text-center font-semibold text-text">{value ? <Check size={17} className="mx-auto text-success" aria-label="متاح" /> : <Minus size={17} className="mx-auto text-text-muted" aria-label="غير متاح" />}</td>)}</tr>)}
            <tr className="border-t border-border"><th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">السعر الشهري</th>{PLAN_CATALOG.map((plan) => <td key={plan.code} className="px-4 py-4 text-center font-bold text-text">{priceLabel(resolvePlanPrice(plan, currency, 'monthly'))}</td>)}</tr>
            <tr className="border-t border-border"><th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">السعر السنوي</th>{PLAN_CATALOG.map((plan) => <td key={plan.code} className="px-4 py-4 text-center font-bold text-text">{priceLabel(resolvePlanPrice(plan, currency, 'yearly'))}</td>)}</tr>
          </tbody></table></div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-accent/50 bg-accent/10 p-6 shadow-card"><div className="flex items-start gap-3"><CheckCircle2 size={22} className="mt-0.5 shrink-0 text-accent" /><div><h3 className="font-bold text-text">إضافة المساعد الشخصي</h3><p className="mt-2 text-sm leading-7 text-text-muted">أضف مساعداً شخصياً لأي باقة تجارية لإدارة مهامك ومعلوماتك الخاصة وملخصك اليومي، بشكل منفصل عن وكيل العملاء.</p><Link href="/signup" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">ابدأ إعداد المساعد</Link></div></div></article>
          <article className="rounded-2xl border border-border bg-surface p-6 shadow-card"><h3 className="font-bold text-text">مشمول في كل باقة</h3><ul className="mt-3 grid gap-2 text-sm leading-6 text-text-muted sm:grid-cols-2">{['صندوق محادثات موحد', 'حماية وعزل بيانات المؤسسة', 'إعداد الوكيل الأساسي', 'إمكانية الترقية والإلغاء'].map((item) => <li key={item} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-success" />{item}</li>)}</ul></article>
        </div>
        <div className="mt-8 rounded-2xl border border-primary/20 bg-primary-light/30 p-5 text-sm leading-7 text-text sm:p-6"><strong>ضمان بياناتك:</strong> عند انتهاء الاشتراك أو فشل التجديد يعود الحساب تلقائياً إلى الخطة المجانية، ولا تُحذف بياناتك أو محادثاتك أو إعداداتك.</div>

        <div className="mt-8 rounded-2xl border border-border bg-primary-light/35 p-5 shadow-card sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Wallet size={20} /></span><div><h3 className="font-bold text-text">الدفع بالمحافظ الإلكترونية اليمنية</h3><p className="mt-1 text-sm leading-7 text-text-muted">تتم عملية التحصيل بالريال اليمني من المحافظ المفعّلة، وتظهر خيارات الدفع المتاحة فعلياً عند إتمام الاشتراك.</p></div></div></div>
        <p className="mt-6 text-center text-xs leading-6 text-text-muted">{pricing.source === 'database' ? `الأسعار معروضة بـ${CURRENCY_LABELS[currency] ?? currency} كما يعتمدها فريق KAYAN AI.` : 'الأسعار بالدولار المرجعي.'} قيمة الريال اليمني النهائية تُحسب وفق سعر الصرف المعتمد وقت إنشاء طلب الدفع.</p>
      </div>
    </section>
  )
}
