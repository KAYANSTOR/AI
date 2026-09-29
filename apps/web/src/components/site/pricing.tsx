import { Check } from 'lucide-react'
import { Chip, Section, SectionHeading } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

type Plan = {
  id: string
  name: string
  price: string
  cadence: string
  audience: string
  features: readonly { label: string; soon?: boolean }[]
  featured?: boolean
}

const PLANS: readonly Plan[] = [
  {
    id: 'starter',
    name: 'الأساسية',
    price: '$49',
    cadence: 'شهريًا',
    audience: 'شركة صغيرة تبدأ بأول قناة تواصل',
    features: [
      { label: 'ردود الوكيل الذكي على واتساب' },
      { label: 'صندوق موحّد وسجل محادثات' },
      { label: 'الحجز والمواعيد' },
      { label: 'حتى 300 دقيقة استخدام' },
    ],
  },
  {
    id: 'growth',
    name: 'النمو',
    price: '$99',
    cadence: 'شهريًا',
    audience: 'الشركات التي تعتمد على المكالمات والمواعيد',
    featured: true,
    features: [
      { label: 'كل ما في الخطة الأساسية' },
      { label: 'الوكيل الذكي على الهاتف' },
      { label: 'إدارة العملاء المحتملين' },
      { label: 'متابعة تلقائية للعملاء', soon: true },
      { label: 'استعادة العملاء المفقودين', soon: true },
      { label: 'حتى 600 دقيقة استخدام' },
    ],
  },
  {
    id: 'pro',
    name: 'الاحترافية',
    price: '$199',
    cadence: 'شهريًا',
    audience: 'عيادات وفروع متعددة وحجم محادثات أعلى',
    features: [
      { label: 'كل ما في خطة النمو' },
      { label: 'محادثات غير محدودة' },
      { label: 'مؤشرات الإيرادات والأداء' },
      { label: 'دعم مباشر ذو أولوية' },
      { label: 'فروع أو مواقع متعددة' },
    ],
  },
] as const

const ADD_ONS = [
  { label: 'إعداد وتدريب أولي', value: '$149 لمرة واحدة' },
  { label: 'استعادة حجز من الفرص القديمة', value: '$5 لكل حجز' },
  { label: 'علامة تجارية خاصة للوكالات', value: '$299' },
] as const

export function Pricing() {
  return (
    <Section id="pricing" tone="background" labelledBy="pricing-title">
      <SectionHeading
        id="pricing-title"
        eyebrow="الأسعار"
        title="خطط واضحة تناسب حجم شركتك"
        description="ابدأ بالخطة التي تغطي قناة واحدة، وارتقِ عند إضافة قنوات ومتابعة تلقائية. كل خطة تشمل إنشاء حساب الشركة وإعداد ملفها."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`flex flex-col rounded-2xl border bg-surface p-6 sm:p-8 ${
              plan.featured ? 'border-primary-dark shadow-md' : 'border-border shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-text">{plan.name}</h3>
              {plan.featured ? <Chip tone="brand">الأكثر مناسبة</Chip> : null}
            </div>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-text">{plan.price}</span>
              <span className="text-sm text-text-muted">{plan.cadence}</span>
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">{plan.audience}</p>

            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature.label} className="flex items-start gap-3 text-sm leading-7 text-text">
                  <Check size={18} aria-hidden="true" className="mt-1 shrink-0 text-success" />
                  <span>
                    {feature.label}
                    {feature.soon ? (
                      <Chip tone="soon" className="ms-2 align-middle">
                        قريبًا
                      </Chip>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              {plan.featured ? (
                <PrimaryCta href="/signup" className="w-full">
                  إنشاء حساب للشركة
                </PrimaryCta>
              ) : (
                <SecondaryCta href="/signup" className="w-full">
                  إنشاء حساب للشركة
                </SecondaryCta>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-10 grid gap-4 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
        {ADD_ONS.map((addOn) => (
          <div key={addOn.label}>
            <p className="text-xs text-text-muted">{addOn.label}</p>
            <p className="mt-1 text-sm font-semibold text-text">{addOn.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs leading-6 text-text-muted">
        الأسعار المعتمدة في خطة الإطلاق. تفعيل الاشتراك والدفع داخل المنصة يأتي مع مرحلة الفوترة في
        الخطة، وإنشاء الحساب اليوم لا يتطلب أي دفع.
      </p>
    </Section>
  )
}
