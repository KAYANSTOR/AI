import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { Pricing } from '@/components/site/pricing'
import { Faq, FAQ_ITEMS } from '@/components/site/faq'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { CreditCard } from 'lucide-react'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'

export const metadata: Metadata = {
  title: 'خطط الأسعار والاشتراكات | KAYAN AI',
  alternates: { canonical: '/pricing' },
  description: 'أربع خطط واضحة من المجاني إلى الأعمال، مع الدفع بالريال اليمني عبر المحافظ الإلكترونية المتاحة.',
}

const pricingStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: 'KAYAN AI Plans',
      description: 'خطط اشتراك منصة KAYAN AI لاستقبال العملاء وإدارة المحادثات والأتمتة.',
      offers: PLAN_CATALOG.map((plan) => ({
        '@type': 'Offer',
        name: plan.nameEn,
        price: String(plan.monthlyPrice),
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
}

export default function PricingPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/40 px-3.5 py-1 text-xs font-bold text-secondary">
              <CreditCard size={14} />
              <span>أربع خطط · أسعار واضحة · دفع محلي</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              اختر خطة تنمو مع أعمالك
            </h1>
            <p className="text-base leading-relaxed text-text-muted sm:text-lg">
              ابدأ مجاناً، ثم انتقل إلى الخطة التي تناسب حجم استخدامك. الأسعار بالدولار المرجعي، والدفع عبر المحافظ اليمنية عند تفعيل حساب التاجر.
            </p>
          </div>
        </Section>

        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingStructuredData) }}
      />
    </>
  )
}
