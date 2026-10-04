import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { HowItWorks } from '@/components/site/how-it-works'
import { ProblemSolution } from '@/components/site/problem-solution'
import { FinalCta } from '@/components/site/final-cta'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'
import { Workflow, ArrowDown, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'طريقة العمل | FrontDesk AI',
  description: 'كيف تبدأ وتفعّل موظف الاستقبال الذكي لشركتك في ٣ خطوات بسيطة دون أي تعقيد تقني.',
}

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* How It Works Hero Banner */}
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/20 px-3.5 py-1 text-xs font-bold text-primary-dark">
              <Workflow size={14} />
              <span>بساطة التفعيل والتشغيل</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              كيف يعمل النظام مع شركتك؟
            </h1>
            <p className="text-base text-text-muted leading-relaxed sm:text-lg">
              لا تحتاج إلى تعيين موظفين إضافيين أو تركيب خوادم معقدة. خلال دقائق قليلة، يربط النظام رقم هاتفك وواتساب بقاعدة معرفتك المعتمدة ليبدأ العمل فوراً.
            </p>
          </div>
        </Section>

        {/* Step-by-Step Flow */}
        <HowItWorks />

        {/* The Problem Before & After Solution */}
        <ProblemSolution />

        {/* Final Call to Action */}
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  )
}
