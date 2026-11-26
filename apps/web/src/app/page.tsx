import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/site-header'
import { Hero } from '@/components/site/hero'
import { ProblemSolution } from '@/components/site/problem-solution'
import { Trust } from '@/components/site/trust'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section, SectionHeading } from '@/components/site/section'
import { ArrowLeft, Briefcase, CreditCard, Sparkles, Workflow } from 'lucide-react'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const siteUrl = 'https://kayan-ai.up.railway.app'
const organizationId = `${siteUrl}/#organization`

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'KAYAN AI',
      url: siteUrl,
      description:
        'منصة عربية لموظف استقبال ذكي يساعد الشركات على استقبال استفسارات العملاء وتأهيلهم وحجز المواعيد وتنظيم المحادثات.',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icons/icon-512.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'KAYAN AI',
      url: siteUrl,
      inLanguage: 'ar',
      publisher: { '@id': organizationId },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#software`,
      name: 'KAYAN AI',
      url: siteUrl,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ar',
      description:
        'منصة يستقبل بها الذكاء الاصطناعي عملاء الشركات عبر قنوات المراسلة المرتبطة: يفهم الطلب، يؤهّل العميل، يحجز الموعد، ويسجّل كل محادثة وفرصة في لوحة واحدة.',
      publisher: { '@id': organizationId },
      offers: PLAN_CATALOG.map((plan) => ({
        '@type': 'Offer',
        name: plan.nameEn,
        price: String(plan.monthlyPrice),
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      })),
    },
  ],
}

const EXPLORE = [
  { title: 'المميزات', desc: 'الرد الآلي، تأهيل العملاء، الحجوزات، العروض والطلبات في نظام واحد.', href: '/features', icon: Sparkles },
  { title: 'طريقة العمل', desc: 'ثلاث خطوات من إنشاء الحساب حتى أول محادثة يرد عليها الوكيل.', href: '/how-it-works', icon: Workflow },
  { title: 'الأسعار', desc: 'باقات شهرية واضحة تناسب حجم نشاطك وعدد المحادثات.', href: '/pricing', icon: CreditCard },
  { title: 'الأنشطة', desc: 'إعدادات جاهزة للعيادات والمطاعم والفنادق والشركات الخدمية.', href: '/services', icon: Briefcase },
] as const

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-secondary"
      >
        تخطَّ إلى المحتوى الرئيسي
      </a>

      <SiteHeader />

      <main id="main" className="flex-1">
        <Hero />
        <ProblemSolution />

        <Section tone="surface" className="border-b border-border" labelledBy="explore-heading">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading
              id="explore-heading"
              align="start"
              eyebrow="المنصة"
              title="كل ما يحتاجه فريق خدمة العملاء"
              description="تعرّف على تفاصيل المنصة، أو ابدأ مباشرة بإنشاء حساب شركتك."
            />
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXPLORE.map(({ title, desc, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col rounded-2xl border border-border bg-surface p-6 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-raised)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/50 text-secondary">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-text">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-text-muted">{desc}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary">
                  التفاصيل
                  <ArrowLeft size={15} aria-hidden="true" className="transition-transform group-hover:-translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Trust />
        <FinalCta />
      </main>

      <SiteFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </>
  )
}
