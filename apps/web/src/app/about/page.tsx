import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { About } from '@/components/site/about'
import { Trust } from '@/components/site/trust'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { ShieldCheck, HeartHandshake, Eye } from 'lucide-react'

export const metadata: Metadata = {
  title: 'عن المنصة ورؤيتنا | FrontDesk AI',
  description: 'تعرف على قصة ورؤية FrontDesk AI: منصة عربية متطورة تمكن الشركات في العالم العربي من أتمتة خدمة الاستقبال بالذكاء الاصطناعي.',
}

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* About Page Hero Banner */}
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/20 px-3.5 py-1 text-xs font-bold text-primary-dark">
              <Eye size={14} />
              <span>رؤيتنا ورسالتنا</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              إعادة ابتكار تجربة استقبال العملاء في العالم العربي
            </h1>
            <p className="text-base text-text-muted leading-relaxed sm:text-lg">
              صُممت FrontDesk AI من البداية لتفهم اللهجات والسياق العربي، وتوفر حلاً احترافياً متكاملاً يغني عن انتظار الموظفين أو فقدان الاتصالات.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-border bg-surface p-5 text-center space-y-2 shadow-2xs">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                <HeartHandshake size={20} />
              </div>
              <h3 className="text-sm font-bold text-text">عربية أولاً (RTL Native)</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                تفهم اللهجات الدارجة ومصطلحات الأعمال المحلية بدقة وسلاسة طبيعية.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 text-center space-y-2 shadow-2xs">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-sm font-bold text-text">أمان وخصوصية تامة</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                عزل سحابي كامل لبيانات كل شركة بقواعد وصول صارمة ومحمية.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 text-center space-y-2 shadow-2xs">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                <Eye size={20} />
              </div>
              <h3 className="text-sm font-bold text-text">تحكم بشري كامل</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                لوحة تحكم فورية تتيح لك مراقبة كل مكالمة والتدخل البشري متى شئت.
              </p>
            </div>
          </div>
        </Section>

        {/* Story & About */}
        <About />

        {/* Trust & Enterprise Reliability */}
        <Trust />

        {/* Final CTA */}
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  )
}
