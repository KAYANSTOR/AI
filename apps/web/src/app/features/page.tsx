import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { Features } from '@/components/site/features'
import { BusinessProfiles } from '@/components/site/business-profiles'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { Sparkles, PhoneCall, MessageSquare, Shield, Clock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'المميزات والقدرات | FrontDesk AI',
  description: 'تعرف على إمكانيات موظف الاستقبال الذكي لشركتك: الرد الصوتي بالهاتف، واتساب، جدولة المواعيد، وتأهيل العملاء على مدار الساعة.',
}

export default function FeaturesPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Features Page Hero Banner */}
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/20 px-3.5 py-1 text-xs font-bold text-primary-dark">
              <Sparkles size={14} />
              <span>إمكانيات وتقنيات الذكاء الاصطناعي</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              مميزات صُممت لتمكين وتوسيع أعمالك
            </h1>
            <p className="text-base text-text-muted leading-relaxed sm:text-lg">
              لا تفوّت أي عميل أو اتصال بعد اليوم. يجمع FrontDesk AI بين الرد الصوتي الطبيعي ومحادثات واتساب الذكية، وحفظ بيانات ومواعيد كل عميل في مكان واحد.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-4xl mx-auto">
            {[
              { title: 'رد صوتي فوري', desc: 'باللهجة واللغة العربية', icon: PhoneCall },
              { title: 'واتساب سحابي', desc: 'تأكيد الحجوزات 24/7', icon: MessageSquare },
              { title: 'جدولة ذكية', desc: 'ربط مباشر مع مواعيدك', icon: Clock },
              { title: 'عزل تام للبيانات', desc: 'أمان وخصوصية لكل شركة', icon: Shield },
            ].map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="rounded-2xl border border-border bg-surface p-4 text-center space-y-1.5 shadow-2xs">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-text">{f.title}</h3>
                  <p className="text-xs text-text-muted">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* In-depth Features Grid */}
        <Features />

        {/* Activity & Business Profiles */}
        <BusinessProfiles />

        {/* Final CTA */}
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  )
}
