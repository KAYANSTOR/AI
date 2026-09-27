import {
  ArrowRightLeft,
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  Gauge,
  Repeat2,
  ScanSearch,
  ShoppingCart,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chip, Section, SectionHeading } from './section'

type Service = {
  icon: LucideIcon
  title: string
  body: string
  status: 'live' | 'soon'
}

const SERVICES: readonly Service[] = [
  {
    icon: BadgeCheck,
    title: 'استقبال العملاء',
    body: 'بدء محادثة منظّمة مع كل عميل يصل عبر القنوات المرتبطة بحساب شركتك.',
    status: 'live',
  },
  {
    icon: ScanSearch,
    title: 'فهم طلب العميل',
    body: 'قراءة الرسالة أو المكالمة واستخراج الطلب والتفاصيل المهمة منه.',
    status: 'live',
  },
  {
    icon: Gauge,
    title: 'تأهيل العملاء',
    body: 'أسئلة التأهيل بحسب نشاط الشركة قبل تسجيل الفرصة أو تحويلها.',
    status: 'live',
  },
  {
    icon: ClipboardList,
    title: 'تسجيل العملاء المحتملين',
    body: 'ملف للعميل المحتمل بحالته واهتمامه وقيمته المتوقعة داخل لوحة الشركة.',
    status: 'live',
  },
  {
    icon: CalendarCheck,
    title: 'الحجز',
    body: 'التحقق من التوفر وإنشاء الموعد وربطه بالعميل والخدمة.',
    status: 'live',
  },
  {
    icon: ShoppingCart,
    title: 'المبيعات والطلبات',
    body: 'وحدات الباقات والأسعار والطلبات بحسب نشاط الشركة لتنظيم الطلب ومتابعته.',
    status: 'soon',
  },
  {
    icon: Repeat2,
    title: 'المتابعة',
    body: 'بقاء الفرصة مسجّلة بحالة واضحة، مع سلاسل متابعة تلقائية في المرحلة القادمة.',
    status: 'soon',
  },
  {
    icon: Sparkles,
    title: 'استعادة العملاء المفقودين',
    body: 'إعادة التواصل مع الفرص التي لم تُغلق، بدل تركها بلا متابعة.',
    status: 'soon',
  },
  {
    icon: ArrowRightLeft,
    title: 'التحويل للموظف عند الحاجة',
    body: 'عند طلب العميل التحدث مع إنسان، يحوّل الوكيل المحادثة إلى فريق شركتك.',
    status: 'live',
  },
] as const

export function Services() {
  return (
    <Section id="services" tone="background" labelledBy="services-title">
      <SectionHeading
        id="services-title"
        eyebrow="خدمات المنصة"
        title="ما تفعله المنصة فعليًا مع كل عميل"
        description="من أول رسالة إلى حجز مؤكد أو فرصة مسجّلة — هذه هي الخدمات التي تعمل عليها المنصة، بحسب الوحدات المفعّلة في حساب شركتك."
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => (
          <li key={service.title} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-primary-dark">
                <service.icon size={22} aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-text">{service.title}</h3>
                  {service.status === 'soon' ? <Chip tone="soon">قيد التوسّع</Chip> : null}
                </div>
                <p className="mt-2 text-sm leading-7 text-text-muted">{service.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
