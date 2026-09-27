import {
  Bot,
  CalendarCheck,
  Camera,
  Inbox,
  MessageCircle,
  PhoneCall,
  Repeat2,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chip, Section, SectionHeading } from './section'

type Feature = {
  icon: LucideIcon
  title: string
  body: string
  /** Availability is stated explicitly — no claim beyond what the platform does today. */
  status: 'live' | 'soon'
}

const FEATURES: readonly Feature[] = [
  {
    icon: Bot,
    title: 'AI Receptionist',
    body: 'وكيل واحد يرد نيابة عن شركتك، يفهم الطلب، ويقرّر الخطوة المناسبة داخل سجل العميل.',
    status: 'live',
  },
  {
    icon: PhoneCall,
    title: 'الهاتف',
    body: 'اربط رقم شركتك ليستقبل الوكيل المكالمات ويجيب على أسئلة الخدمات ويحجز المواعيد.',
    status: 'live',
  },
  {
    icon: MessageCircle,
    title: 'واتساب',
    body: 'استقبال رسائل العملاء عبر واتساب للأعمال وردّ الوكيل عليها في نفس سجل المحادثة.',
    status: 'live',
  },
  {
    icon: Camera,
    title: 'إنستغرام',
    body: 'قناة إضافية لرسائل العملاء المباشرة، لتنضم إلى نفس القنوات والوحدات.',
    status: 'soon',
  },
  {
    icon: Inbox,
    title: 'صندوق موحّد',
    body: 'كل محادثات القنوات في مكان واحد، مع سجل رسائل كامل لكل عميل وفريق العمل.',
    status: 'live',
  },
  {
    icon: UserPlus,
    title: 'إدارة العملاء المحتملين',
    body: 'ملف العميل المحتمل بحالته واهتمامه وقيمته المتوقعة، لتعرف من يقترب من الحجز.',
    status: 'live',
  },
  {
    icon: CalendarCheck,
    title: 'الحجز',
    body: 'التحقق من التوفر وإنشاء الموعد وربطه بالعميل والخدمة داخل نفس النظام.',
    status: 'live',
  },
  {
    icon: Repeat2,
    title: 'المتابعة',
    body: 'سلاسل متابعة تلقائية بحسب الحدث: مكالمة فائتة، عدم حضور، أو عميل جديد.',
    status: 'soon',
  },
  {
    icon: Sparkles,
    title: 'استعادة العملاء المفقودين',
    body: 'إعادة تحريك الفرص القديمة برسائل منظّمة بدل تركها للنسيان.',
    status: 'soon',
  },
] as const

export function Features() {
  return (
    <Section id="features" tone="background" labelledBy="features-title">
      <SectionHeading
        id="features-title"
        eyebrow="المميزات"
        title="كل ما تحتاجه لاستقبال العملاء ومتابعتهم"
        description="المنصة تبني واحدًا ثم تضيف القنوات والوحدات تدريجيًا. الشارات أدناه تعكس حالة كل ميزة فعليًا، بلا مبالغة."
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="flex flex-col rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/35 text-primary-dark">
                <feature.icon size={22} aria-hidden="true" />
              </span>
              {feature.status === 'live' ? (
                <Chip tone="brand">متاح الآن</Chip>
              ) : (
                <Chip tone="soon">قريبًا</Chip>
              )}
            </div>
            <h3 className="mt-4 text-base font-semibold text-text">{feature.title}</h3>
            <p className="mt-2 text-sm leading-7 text-text-muted">{feature.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
