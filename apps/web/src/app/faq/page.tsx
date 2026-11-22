import type { Metadata } from 'next'
import { HelpCircle } from 'lucide-react'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'
import { Faq } from '@/components/site/faq'
import { Section } from '@/components/site/section'

export const metadata: Metadata = {
  title: 'الأسئلة الشائعة | KAYAN AI',
  alternates: { canonical: '/faq' },
  description: 'إجابات مباشرة عن KAYAN AI والقنوات والإعداد والأمان والأسعار.',
}

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/40 px-3.5 py-1 text-xs font-bold text-secondary">
              <HelpCircle size={14} aria-hidden="true" />
              <span>مركز الإجابات</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              كل ما تحتاج معرفته قبل تشغيل الوكيل
            </h1>
            <p className="text-base leading-relaxed text-text-muted sm:text-lg">
              إجابات مختصرة وواضحة عن طريقة العمل، القنوات، الأمان، وإدارة حساب شركتك.
            </p>
          </div>
        </Section>
        <Faq />
      </main>
      <SiteFooter />
    </>
  )
}
