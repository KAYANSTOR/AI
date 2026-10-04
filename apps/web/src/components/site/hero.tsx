import Link from 'next/link'
import { CalendarCheck, CheckCircle2, MessageCircle, PhoneCall } from 'lucide-react'
import { Chip, Section } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

const HERO_FACTS = [
  'تسجيل مباشر: أنشئ حساب شركتك ويتولّى النظام بناء مساحتها تلقائيًا',
  'تختار نوع نشاط شركتك، فيُضبط النظام والوحدات عليه',
  'كل محادثة وعميل وموعد مسجّل في لوحة واحدة',
] as const

export function Hero() {
  return (
    <Section id="top" tone="background" className="border-b border-border" labelledBy="hero-title">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Chip tone="brand">
            <MessageCircle size={14} aria-hidden="true" />
            منصة AI لاستقبال عملاء الشركات
          </Chip>

          <h1
            id="hero-title"
            className="mt-6 text-3xl font-bold leading-snug tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.2]"
          >
            موظّف استقبال بالذكاء الاصطناعي
            <span className="block text-primary-dark">يستقبل عملاء شركتك… ولا يفوّت أحدًا</span>
          </h1>

          <p className="mt-5 text-base leading-8 text-text-muted sm:text-lg">
            منصة واحدة تستقبل عملاءك على الهاتف وواتساب: تفهم الطلب، تجيب من معلومات شركتك، تؤهّل
            العميل، تحجز الموعد أو تسجّل الفرصة، وتحفظ كل محادثة في لوحة واحدة.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">إنشاء حساب للشركة</PrimaryCta>
            <SecondaryCta href="/login">تسجيل الدخول</SecondaryCta>
          </div>

          <Link
            href="/how-it-works"
            className="mt-4 inline-flex rounded-md text-sm font-semibold text-primary-dark underline decoration-primary-light decoration-2 underline-offset-4 transition-colors hover:decoration-primary-dark"
          >
            كيف تعمل المنصة؟
          </Link>

          <ul className="mt-9 space-y-3 text-sm leading-7 text-text-muted">
            {HERO_FACTS.map((fact) => (
              <li key={fact} className="flex items-start gap-3">
                <CheckCircle2
                  size={18}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-success"
                />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview />
      </div>
    </Section>
  )
}

/** Illustrative single-thread preview — real product surfaces, example content. */
function HeroPreview() {
  return (
    <figure className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark">
            <PhoneCall size={18} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">صندوق موحّد</p>
            <p className="text-xs text-text-muted">عميل جديد · واتساب</p>
          </div>
        </div>
        <Chip tone="soon">مثال توضيحي</Chip>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-7">
        <p className="max-w-[85%] rounded-2xl rounded-ss-sm border border-border bg-background px-4 py-3 text-text">
          أريد موعدًا لتنظيف البشرة يوم الخميس
        </p>
        <p className="ms-auto max-w-[90%] rounded-2xl rounded-se-sm bg-primary-light/35 px-4 py-3 text-text">
          أهلًا بك! الخدمة متاحة (45 دقيقة). المواعيد المتوفّرة يوم الخميس: 5:00 أو 6:30 مساءً —
          أيّهما يناسبك؟
        </p>
        <p className="max-w-[60%] rounded-2xl rounded-ss-sm border border-border bg-background px-4 py-3 text-text">
          6:30 مساءً
        </p>
        <p className="ms-auto max-w-[90%] rounded-2xl rounded-se-sm bg-primary-light/35 px-4 py-3 text-text">
          تم تثبيت موعدك يوم الخميس 6:30 مساءً. ستصلك رسالة تأكيد قبل الموعد.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <Chip tone="brand">
          <CalendarCheck size={14} aria-hidden="true" />
          تم إنشاء الحجز
        </Chip>
        <Chip tone="neutral">تم تحديث ملف العميل</Chip>
        <Chip tone="neutral">الرد من معلومات الخدمة</Chip>
      </div>

      <figcaption className="mt-4 text-xs leading-6 text-text-muted">
        مثال توضيحي لتسلسل واحد داخل المنصة: من رسالة العميل إلى الحجز المسجّل.
      </figcaption>
    </figure>
  )
}
