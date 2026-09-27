import { Section, SectionHeading } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

const STEPS = [
  {
    title: 'أنشئ حساب شركتك',
    body: 'تسجيل مباشر ببريد العمل وكلمة المرور، ويُنشأ مساحة الشركة تلقائيًا مع بياناتها الأساسية.',
  },
  {
    title: 'اختر نوع نشاط الشركة',
    body: 'يفعّل النظام الوحدات الافتراضية المناسبة لنشاطك، ويمكنك تعديلها لاحقًا من الإعدادات.',
  },
  {
    title: 'اربط قنوات التواصل',
    body: 'اربط رقم الهاتف ورقم واتساب الخاص بشركتك، وكل قناة تُسجَّل ضمن حسابك.',
  },
  {
    title: 'عرّف خدماتك ومعلوماتك',
    body: 'أضف خدماتك ومدّتها وأسعارها وساعات العمل، فيبني الوكيل إجاباته من هذه المعلومات.',
  },
  {
    title: 'فعّل الوكيل الذكي',
    body: 'يشغّل النظام الوكيل على القنوات المرتبطة ويمنحه الأدوات المسموحة لوحداتك المفعّلة فقط.',
  },
  {
    title: 'ابدأ استقبال العملاء',
    body: 'تصل كل محادثة إلى لوحة التحكم مع ملف العميل والإجراء الذي نُفّذ والخطوة التالية.',
  },
] as const

export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="dark" labelledBy="how-title">
      <SectionHeading
        id="how-title"
        tone="dark"
        eyebrow="طريقة العمل"
        title="من التسجيل إلى أول عميل… ست خطوات"
        description="لا إعداد تقني معقّد ولا أدوات خارجية للتشغيل: أنشئ حساب الشركة، حدّد نشاطك، واربط قنواتك."
      />

      <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-primary-light/60"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-dark">
              {index + 1}
            </span>
            <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
            <p className="mt-2 text-sm leading-7 text-white/75">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-center">
        <PrimaryCta href="/signup">إنشاء حساب للشركة</PrimaryCta>
        <SecondaryCta
          href="/#pricing"
          className="border-white/20 bg-transparent text-white hover:border-primary-light hover:text-primary-light"
        >
          اطّلع على الأسعار
        </SecondaryCta>
      </div>
    </Section>
  )
}
