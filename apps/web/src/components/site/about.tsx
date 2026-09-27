import { Blocks, Brain, ClipboardList, MessagesSquare } from 'lucide-react'
import { Section, SectionHeading } from './section'

const CORE_LOOP = [
  'يستقبل',
  'يفهم',
  'يرد',
  'يؤهّل',
  'يحجز',
  'يتابع',
  'يسجّل',
] as const

const PRINCIPLES = [
  {
    icon: MessagesSquare,
    title: 'قنوات موحّدة',
    body: 'الهاتف وواتساب في صندوق واحد، وكل محادثة مرتبطة بملف العميل وسجلّه.',
  },
  {
    icon: Brain,
    title: 'AI يرد من معلومات شركتك',
    body: 'يبني الوكيل سياقه من معلومات شركتك وخدماتها وساعات العمل — لا من معلومات عامة.',
  },
  {
    icon: Blocks,
    title: 'محرّك قدرات لا نسخ متعددة',
    body: 'الوحدات المفعّلة تحدّد ما يستطيع الوكيل فعله وما يظهر في لوحتك، دون نظام منفصل لكل نشاط.',
  },
  {
    icon: ClipboardList,
    title: 'سجل كامل لا شيء يُنسى',
    body: 'كل عميل ورسالة وموعد وحالة فرصة محفوظة ويمكن الرجوع إليها في أي وقت.',
  },
] as const

export function About() {
  return (
    <Section id="about" tone="surface" labelledBy="about-title">
      <SectionHeading
        id="about-title"
        eyebrow="عن المنصة"
        title="نواة واحدة… تتكيّف مع نشاط شركتك"
        description="FrontDesk AI ليست مجموعة ردود جاهزة. هي منصة واحدة تجمع العملاء والمحادثات والقنوات ووكيل الذكاء الاصطناعي، ثم تُحمّل فوقها وحدات النشاط التي تحتاجها شركتك فقط."
      />

      <ol className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {CORE_LOOP.map((step, index) => (
          <li
            key={step}
            className="rounded-xl border border-border bg-background px-3 py-4 text-center"
          >
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary-light/40 text-xs font-bold text-primary-dark">
              {index + 1}
            </span>
            <span className="mt-2 block text-sm font-semibold text-text">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {PRINCIPLES.map((principle) => (
          <article
            key={principle.title}
            className="rounded-2xl border border-border bg-background p-6 transition-colors hover:border-primary-light"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/35 text-primary-dark">
              <principle.icon size={22} aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-text">{principle.title}</h3>
            <p className="mt-2 text-sm leading-7 text-text-muted">{principle.body}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}
