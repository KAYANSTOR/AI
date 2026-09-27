import { Section } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

export function FinalCta() {
  return (
    <Section id="start" tone="background">
      <div className="rounded-3xl bg-primary-dark px-6 py-12 text-center sm:px-10 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight text-surface sm:text-3xl">
          ابدأ باستقبال أول عميل عبر الوكيل الذكي
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-surface/90 sm:text-base">
          أنشئ حساب شركتك، اختر نوع نشاطك، واربط قنواتك — وبعدها تصلك المحادثات والمواعيد في لوحة
          واحدة بدل أن تضيع في تطبيقات متفرقة.
        </p>
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <PrimaryCta
            href="/signup"
            className="bg-surface text-primary-dark hover:bg-background hover:text-primary-dark"
          >
            إنشاء حساب للشركة
          </PrimaryCta>
          <SecondaryCta
            href="/login"
            className="border-surface/40 bg-transparent text-surface hover:border-surface hover:text-surface"
          >
            تسجيل الدخول
          </SecondaryCta>
        </div>
      </div>
    </Section>
  )
}
