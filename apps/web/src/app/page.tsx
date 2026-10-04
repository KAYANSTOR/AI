import Link from 'next/link'
import { SiteHeader } from '@/components/site/site-header'
import { Hero } from '@/components/site/hero'
import { ProblemSolution } from '@/components/site/problem-solution'
import { Trust } from '@/components/site/trust'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section, SectionHeading } from '@/components/site/section'
import {
  ArrowLeft,
  Sparkles,
  PhoneCall,
  Workflow,
  CreditCard,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'

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
  ],
}

const QUICK_EXPLORE_CARDS = [
  {
    title: 'المميزات والقدرات',
    desc: 'اكتشف كيف يتعامل الوكيل الصوتي ومحادثات واتساب مع استفسارات العملاء وجدولة المواعيد بدقة.',
    href: '/features',
    icon: Sparkles,
    badge: 'ذكاء اصطناعي',
  },
  {
    title: 'طريقة العمل',
    desc: '٣ خطوات فقط تفصلك عن امتلاك موظف استقبال آلي مخصص لنشاطك التجاري دون أي تعقيد تقني.',
    href: '/how-it-works',
    icon: Workflow,
    badge: 'سهولة الإعداد',
  },
  {
    title: 'خطط الأسعار',
    desc: 'باقات شهرية وسنوية مرنة وشفافة تناسب الشركات الناشئة والمؤسسات المتنامية.',
    href: '/pricing',
    icon: CreditCard,
    badge: 'اشتراكات مرنة',
  },
  {
    title: 'الأنشطة والحلول',
    desc: 'حلول مخصصة للعيادات، المطاعم، الفنادق، الشركات الخدمية ومكاتب الاستشارات.',
    href: '/services',
    icon: Briefcase,
    badge: 'مهيأ لنشاطك',
  },
]

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
        {/* Hero Section */}
        <Hero />

        {/* Problem vs Solution */}
        <ProblemSolution />

        {/* Quick Hub Navigation Cards */}
        <Section tone="surface" className="border-b border-border py-14 lg:py-20">
          <SectionHeading
            id="explore-heading"
            eyebrow="استكشف المنصة"
            title="كل ما تحتاجه للارتقاء بخدمة عملائك"
            description="اختر القسم الذي يهمك للتعرف على تفاصيل المنصة، أو ابدأ مباشرة بتجربة النظام مجاناً."
          />

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_EXPLORE_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  prefetch={true}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border bg-background p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary-dark/40 hover:bg-surface hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark transition-colors group-hover:bg-primary group-hover:text-white">
                        <Icon size={20} />
                      </div>
                      <span className="text-[11px] font-extrabold text-primary-dark bg-primary-light/20 px-2 py-0.5 rounded-full">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-text group-hover:text-primary-dark transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-text-muted">
                      {card.desc}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-primary-dark group-hover:gap-2.5 transition-all">
                    <span>عرض التفاصيل</span>
                    <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
                  </div>
                </Link>
              )
            })}
          </div>
        </Section>

        {/* Live Call Voice Highlight Card */}
        <Section tone="background" className="border-b border-border py-14 lg:py-20">
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary-light/25 via-surface to-background p-8 lg:p-12 shadow-xs">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-surface px-3 py-1 text-xs font-bold text-primary-dark shadow-2xs">
                  <PhoneCall size={14} />
                  <span>الرد الصوتي الذكي في اليمن والعالم العربي</span>
                </div>

                <h2 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl lg:text-4xl leading-tight">
                  لا تفقد أي اتصال عندما يكون فريقك مشغولاً أو خارج الدوام
                </h2>

                <p className="text-sm leading-relaxed text-text-muted sm:text-base">
                  مع خاصية <strong>تحويل المكالمات الذكية</strong>، يظل رقم هاتفك الحالي كما هو دون أي تغيير، ويتم تحويل المكالمات التي لا ترد عليها تلقائياً إلى موظف الاستقبال الذكي ليرد بلهجة طبيعية ويحجز المواعيد ويسجل بيانات المتصل.
                </p>

                <div className="space-y-2.5 pt-2">
                  {[
                    'كود تحويل مباشر وسريع لشريحة يمن موبايل، يو، وسبأفون',
                    'يفهم استفسارات الأسعار والخدمات وقاعدة معرفة شركتك المعتمدة',
                    'إمكانية تحويل المكالمة إلى إنسان متى ما طلب العميل ذلك',
                  ].map((point) => (
                    <div key={point} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-text">
                      <CheckCircle2 size={16} className="text-success shrink-0" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 flex flex-wrap items-center gap-3">
                  <Link
                    href="/features"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-dark transition-all shadow-xs"
                  >
                    <span>استكشف مميزات المكالمات</span>
                    <ArrowLeft size={16} />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-bold text-text hover:bg-background transition-all"
                  >
                    <span>خطط الاشتراك</span>
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
                    </span>
                    <span className="text-xs font-bold text-text">مكالمة واردة مباشرة (محاكاة)</span>
                  </div>
                  <span className="text-[11px] font-mono text-text-muted">00:48</span>
                </div>

                <div className="space-y-3 text-xs leading-relaxed">
                  <div className="rounded-xl bg-background p-3.5 space-y-1">
                    <p className="font-bold text-text-muted text-[11px]">العميل:</p>
                    <p className="text-text font-medium">«أهلاً، حاب أعرف هل عندكم موعد متاح بكرة الصباح لحجز استشارة؟»</p>
                  </div>
                  <div className="rounded-xl bg-primary-light/20 p-3.5 space-y-1 border border-primary/20">
                    <p className="font-bold text-primary-dark text-[11px]">موظف الاستقبال الذكي (FrontDesk AI):</p>
                    <p className="text-text font-medium">«أهلاً بك! نعم، متوفر غداً موعد شاغر الساعة 10:30 صباحاً وآخر الساعة 11:45. أيهما تفضل لأقوم بتأكيد حجزك وإرسال تفاصيل الموعد لرقمك عبر واتساب فوراً؟»</p>
                  </div>
                </div>

                <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-bold text-success flex items-center justify-between">
                  <span>تم تأكيد الموعد وإضافته لتقويمك</span>
                  <CheckCircle2 size={16} />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Trust Proof */}
        <Trust />

        {/* Final CTA */}
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
