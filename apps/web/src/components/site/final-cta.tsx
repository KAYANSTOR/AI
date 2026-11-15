import { ArrowLeft } from 'lucide-react'
import { Section } from './section'
import Link from 'next/link'
import { PrimaryCta } from './cta'

export function FinalCta() {
  return (
    <Section id="start" tone="background">
      <div className="relative overflow-hidden theme-dark rounded-3xl bg-dark px-6 py-14 text-center sm:px-12 sm:py-20">
        <div className="bg-grid-dark absolute inset-0" aria-hidden="true" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-text sm:text-4xl">جهّز موظف الاستقبال لشركتك اليوم</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-text/70 sm:text-base">
            أنشئ الحساب، أضف خدماتك وساعات العمل، واربط واتساب. يبدأ الرد على عملائك في نفس اليوم.
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            <PrimaryCta href="/signup" className="min-h-12 px-7">
              إنشاء حساب الشركة
              <ArrowLeft size={16} aria-hidden="true" />
            </PrimaryCta>
            <Link
              href="/pricing"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-text/25 px-7 text-sm font-semibold text-text transition-colors hover:border-text/60"
            >
              عرض الأسعار
            </Link>
          </div>
        </div>
      </div>
    </Section>
  )
}
