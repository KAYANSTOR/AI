import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { Services } from '@/components/site/services'
import { BusinessProfiles } from '@/components/site/business-profiles'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { Briefcase, Building2, Stethoscope, UtensilsCrossed, Calendar } from 'lucide-react'

export const metadata: Metadata = {
  title: 'الأنشطة والحلول المخصصة | FrontDesk AI',
  description: 'حلول ذكية مهيأة خصيصاً لقطاعك: العيادات الطبية، الشركات، المطاعم والفنادق، تنظيم الفعاليات، ومكاتب الخدمات المهنية.',
}

export default function ServicesPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Services Page Hero Banner */}
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/20 px-3.5 py-1 text-xs font-bold text-primary-dark">
              <Briefcase size={14} />
              <span>حلول مخصصة لقطاع عملك</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              نظام يتكيّف مع طبيعة نشاطك
            </h1>
            <p className="text-base text-text-muted leading-relaxed sm:text-lg">
              سواء كنت تدير عيادة طبية تحتاج لتنظيم المواعيد، أو شركة خدمات تستقبل مئات الاتصالات، يتعرف الذكاء الاصطناعي على خدماتك وأسعارك ويجيب بدقة.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-4xl mx-auto">
            {[
              { title: 'العيادات والمراكز الطبية', desc: 'حجز مواعيد واستشارات', icon: Stethoscope },
              { title: 'المطاعم والضيافة', desc: 'استفسارات وحجوزات طاولات', icon: UtensilsCrossed },
              { title: 'الشركات المهنية', desc: 'تأهيل العملاء وتسجيل الطلبات', icon: Building2 },
              { title: 'تنظيم الفعاليات والأعراس', desc: 'باقات وحجوزات مواسم', icon: Calendar },
            ].map((s) => {
              const Icon = s.icon
              return (
                <div key={s.title} className="rounded-2xl border border-border bg-surface p-4 text-center space-y-1.5 shadow-2xs">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-text">{s.title}</h3>
                  <p className="text-xs text-text-muted">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Services Overview */}
        <Services />

        {/* Business Profiles Detailed */}
        <BusinessProfiles />

        {/* Final CTA */}
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  )
}
