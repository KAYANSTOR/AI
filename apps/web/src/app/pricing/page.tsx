import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { Pricing } from '@/components/site/pricing'
import { Faq, FAQ_ITEMS } from '@/components/site/faq'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { CreditCard, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'خطط الأسعار والاشتراكات | FrontDesk AI',
  description: 'خطط اشتراك شفافة ومرنة تناسب نشاطك التجاري. اختر الخطة المناسبة وابدأ في استقبال عملائك بالذكاء الاصطناعي.',
}

const pricingStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: 'FrontDesk AI Plans',
      description: 'باقات اشتراك موظف الاستقبال الذكي لشركتك عبر الهاتف وواتساب.',
      offers: [
        { '@type': 'Offer', name: 'Starter', price: '49', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Growth', price: '99', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Pro', price: '199', priceCurrency: 'USD' },
      ],
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
        {/* Pricing Page Hero Banner */}
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/20 px-3.5 py-1 text-xs font-bold text-primary-dark">
              <CreditCard size={14} />
              <span>أسعار واضحة بدون رسوم خفية</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              استثمار بسيط يعوضك عن فريق استقبال كامل
            </h1>
            <p className="text-base text-text-muted leading-relaxed sm:text-lg">
              اختر الخطة المناسبة لحجم اتصالات ورسائل شركتك. يمكنك الترقية أو تغيير الخطة في أي وقت بسهولة.
            </p>
          </div>
        </Section>

        {/* Pricing Cards */}
        <Pricing />

        {/* FAQ Section */}
        <Faq />

        {/* Final CTA */}
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
