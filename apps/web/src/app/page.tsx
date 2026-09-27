import { SiteHeader } from '@/components/site/site-header'
import { Hero } from '@/components/site/hero'
import { About } from '@/components/site/about'
import { ProblemSolution } from '@/components/site/problem-solution'
import { Features } from '@/components/site/features'
import { BusinessProfiles } from '@/components/site/business-profiles'
import { HowItWorks } from '@/components/site/how-it-works'
import { Services } from '@/components/site/services'
import { Trust } from '@/components/site/trust'
import { Pricing } from '@/components/site/pricing'
import { FAQ_ITEMS, Faq } from '@/components/site/faq'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'FrontDesk AI',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ar',
      description:
        'منصة يستقبل بها الذكاء الاصطناعي عملاء الشركات على الهاتف وواتساب: يفهم الطلب، يؤهّل العميل، يحجز الموعد، ويسجّل كل محادثة وفرصة في لوحة واحدة.',
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

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-dark"
      >
        تخطَّ إلى المحتوى الرئيسي
      </a>

      <SiteHeader />

      <main id="main" className="flex-1">
        <Hero />
        <About />
        <ProblemSolution />
        <Features />
        <BusinessProfiles />
        <HowItWorks />
        <Services />
        <Trust />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  )
}
