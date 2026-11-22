'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Wallet } from 'lucide-react'
import { PLAN_CATALOG, type BillingCycle } from '@/lib/billing/plan-catalog'

const METRICS = [
  { key: 'ai_messages', label: 'ردود الذكاء الاصطناعي شهرياً' },
  { key: 'channels', label: 'القنوات النشطة' },
  { key: 'automation_runs', label: 'تشغيلات الأتمتة شهرياً' },
  { key: 'campaign_sends', label: 'إرسالات الحملات شهرياً' },
] as const

function priceLabel(value: number) {
  return value === 0 ? 'مجاناً' : `$${value}`
}

export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <section id="pricing" className="bg-background px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold text-secondary">خطط KAYAN AI</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
            اختر الخطة المناسبة لنمو أعمالك
          </h2>
          <p className="mt-4 text-base leading-8 text-text-muted">
            أسعار واضحة بالدولار، مع إمكانية السداد بالريال اليمني عبر المحافظ المتاحة في حساب التاجر.
          </p>
          <div className="mt-7 inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
            <button
              type="button"
              onClick={() => setCycle('monthly')}
              aria-pressed={cycle === 'monthly'}
              className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${cycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text'}`}
            >
              شهري
            </button>
            <button
              type="button"
              onClick={() => setCycle('yearly')}
              aria-pressed={cycle === 'yearly'}
              className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${cycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text'}`}
            >
              سنوي · شهران مجاناً
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_CATALOG.map((plan) => {
            const selectedPrice = cycle === 'yearly' ? plan.annualPrice : plan.monthlyPrice
            return (
              <article
                key={plan.code}
                className={`relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card transition-shadow hover:shadow-raised ${plan.featured ? 'border-accent ring-1 ring-accent' : 'border-border'}`}
              >
                {plan.featured ? (
                  <span className="absolute -top-3 start-6 rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-accent-foreground">
                    الأكثر اختياراً
                  </span>
                ) : null}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.nameEn}</p>
                  <h3 className="mt-2 text-xl font-extrabold text-text">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-text-muted">{plan.description}</p>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight text-text">{priceLabel(selectedPrice)}</span>
                    {selectedPrice > 0 ? (
                      <span className="text-sm text-text-muted">{cycle === 'yearly' ? 'للسنة' : 'للشهر'}</span>
                    ) : null}
                  </div>
                  {cycle === 'yearly' && plan.monthlyPrice > 0 ? (
                    <p className="mt-1 text-xs text-text-muted">
                      يعادل `$${(plan.annualPrice / 12).toFixed(2)}` شهرياً عند الدفع السنوي
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-text-muted">
                      {plan.monthlyPrice === 0 ? 'بدون رسوم اشتراك' : 'اشتراك شهري قابل للتجديد'}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex-1 border-t border-border pt-5">
                  <p className="mb-3 text-xs font-bold text-text">حدود الخطة</p>
                  <ul className="space-y-3 text-sm text-text-muted">
                    <li className="flex items-start gap-2">
                      <Check size={17} className="mt-0.5 shrink-0 text-success" />
                      {plan.limits.ai_messages.toLocaleString('en-US')} رد ذكي شهرياً
                    </li>
                    <li className="flex items-start gap-2">
                      <Check size={17} className="mt-0.5 shrink-0 text-success" />
                      {plan.limits.channels} قنوات نشطة
                    </li>

                    <li className="flex items-start gap-2">
                      <Check size={17} className="mt-0.5 shrink-0 text-success" />
                      {plan.limits.automation_runs.toLocaleString('en-US')} تشغيل أتمتة شهرياً
                    </li>
                    <li className="flex items-start gap-2">
                      <Check size={17} className="mt-0.5 shrink-0 text-success" />
                      {plan.limits.campaign_sends.toLocaleString('en-US')} إرسال حملة شهرياً
                    </li>
                  </ul>
                </div>

                <Link
                  href="/signup"
                  className={`mt-7 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${plan.featured ? 'bg-primary text-primary-foreground hover:bg-primary-dark' : 'border border-border-strong bg-background text-text hover:border-primary hover:bg-primary-light/30'}`}
                >
                  {plan.monthlyPrice === 0 ? 'ابدأ مجاناً' : 'إنشاء حساب واختيار الخطة'}
                </Link>
              </article>
            )
          })}
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h3 className="text-lg font-bold text-text">مقارنة حدود الخطط</h3>
            <p className="mt-1 text-sm text-text-muted">هذه الحدود مطابقة لعدادات الاشتراك التي يطبقها خادم KAYAN AI.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-background text-text">
                <tr>
                  <th className="px-5 py-4 text-start font-bold">الميزة</th>
                  {PLAN_CATALOG.map((plan) => (
                    <th key={plan.code} className="px-4 py-4 text-center font-bold">{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr key={metric.key} className="border-t border-border">
                    <th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">{metric.label}</th>
                    {PLAN_CATALOG.map((plan) => (
                      <td key={plan.code} className="px-4 py-4 text-center font-semibold tabular-nums text-text">
                        {plan.limits[metric.key].toLocaleString('en-US')}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">السعر الشهري</th>
                  {PLAN_CATALOG.map((plan) => (
                    <td key={plan.code} className="px-4 py-4 text-center font-bold text-text">{priceLabel(plan.monthlyPrice)}</td>
                  ))}
                </tr>
                <tr className="border-t border-border">
                  <th scope="row" className="px-5 py-4 text-start font-medium text-text-muted">السعر السنوي</th>
                  {PLAN_CATALOG.map((plan) => (
                    <td key={plan.code} className="px-4 py-4 text-center font-bold text-text">{priceLabel(plan.annualPrice)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-primary-light/35 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet size={20} />
            </span>
            <div>
              <h3 className="font-bold text-text">الدفع بالمحافظ الإلكترونية اليمنية</h3>
              <p className="mt-1 text-sm leading-7 text-text-muted">
                تتم عملية التحصيل بالريال اليمني من المحافظ المفعّلة والمراقبة في حساب التاجر، وتظهر لك خيارات الدفع المتاحة فعلياً عند إتمام الاشتراك. تشمل شبكات الدفع التي تذكرها خدمة التحقق إيصالات: الكريمي، جيب، جوالي، فلوسك وOneCash.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-6 text-text-muted">
          الأسعار بالدولار المرجعي. قيمة الريال اليمني النهائية تُحسب وفق سعر الصرف المعتمد في حساب التاجر وقت إنشاء طلب الدفع.
        </p>
      </div>
    </section>
  )
}
