import Link from 'next/link'
import { SiteHeader } from '@/components/site/site-header'
import { Hero } from '@/components/site/hero'
import { ProblemSolution } from '@/components/site/problem-solution'
import { Trust } from '@/components/site/trust'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section, SectionHeading } from '@/components/site/section'
import { ArrowLeft, Briefcase, Check, CreditCard, PhoneForwarded, Sparkles, Workflow } from 'lucide-react'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'KAYAN AI',
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
  ],
}

const EXPLORE = [
  { title: 'المميزات', desc: 'الرد الآلي، تأهيل العملاء، الحجوزات، العروض والطلبات في نظام واحد.', href: '/features', icon: Sparkles },
  { title: 'طريقة العمل', desc: 'ثلاث خطوات من إنشاء الحساب حتى أول محادثة يرد عليها الوكيل.', href: '/how-it-works', icon: Workflow },
  { title: 'الأسعار', desc: 'باقات شهرية واضحة تناسب حجم نشاطك وعدد المحادثات.', href: '/pricing', icon: CreditCard },
  { title: 'الأنشطة', desc: 'إعدادات جاهزة للعيادات والمطاعم والفنادق والشركات الخدمية.', href: '/services', icon: Briefcase },
] as const

const FORWARDING_POINTS = [
  'كود تحويل جاهز لشبكات يمن موبايل ويو وسبأفون',
  'يجيب عن الأسعار والخدمات من قاعدة معرفة شركتك',
  'يحوّل المكالمة لموظف عندما يطلب العميل ذلك',
] as const

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary"
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
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/50 text-primary-dark">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-text">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-text-muted">{desc}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  التفاصيل
                  <ArrowLeft size={15} aria-hidden="true" className="transition-transform group-hover:-translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section tone="background" className="border-b border-border" labelledBy="forwarding-heading">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
                <PhoneForwarded size={15} aria-hidden="true" />
                تحويل المكالمات
              </p>
              <h2 id="forwarding-heading" className="mt-3 text-2xl font-bold leading-snug text-text sm:text-4xl sm:leading-tight">
                رقمك يبقى كما هو، والمكالمات الفائتة لا تضيع
              </h2>
              <p className="mt-5 text-base leading-8 text-text-muted">
                فعّل التحويل عند عدم الرد، وتنتقل المكالمة تلقائيًا إلى موظف الاستقبال الرقمي ليرد بلهجة
                طبيعية، يسجّل بيانات المتصل، ويحجز الموعد.
              </p>
              <ul className="mt-7 space-y-3">
                {FORWARDING_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-7 text-text">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check size={12} aria-hidden="true" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/features"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-text px-5 text-sm font-semibold text-surface transition-colors hover:bg-dark-muted"
                >
                  مميزات المكالمات
                  <ArrowLeft size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <figure className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-text">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                  </span>
                  مكالمة واردة محوّلة
                </span>
                <span className="font-mono text-xs tabular-nums text-text-muted" dir="ltr">00:48</span>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-7">
                <div className="rounded-xl bg-background p-4">
                  <p className="text-xs font-semibold text-text-muted">المتصل</p>
                  <p className="mt-1 text-text">عندكم موعد متاح بكرة الصباح لاستشارة؟</p>
                </div>
                <div className="rounded-xl border border-primary/15 bg-primary-light/30 p-4">
                  <p className="text-xs font-semibold text-primary-dark">موظف الاستقبال</p>
                  <p className="mt-1 text-text">
                    أهلًا بك. متاح غدًا 10:30 صباحًا أو 11:45. أيهما يناسبك لأؤكد الحجز وأرسل التفاصيل على واتساب؟
                  </p>
                </div>
              </div>
              <figcaption className="mt-5 flex items-center justify-between rounded-xl border border-success/20 bg-success/[0.07] px-4 py-3 text-sm font-medium text-success">
                تم تأكيد الموعد وإضافته للتقويم
                <Check size={16} aria-hidden="true" />
              </figcaption>
            </figure>
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
