import { ArrowLeft, CalendarCheck, Camera, Check, MessageCircle, PhoneIncoming, UserRound } from 'lucide-react'
import { Section } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

const HERO_FACTS = ['إعداد موجّه خطوة بخطوة', 'واجهة وردود عربية بالكامل', 'تحويل المحادثة لموظف عند الحاجة'] as const

const CHANNELS = [
  { icon: MessageCircle, name: 'واتساب' },
  { icon: Camera, name: 'إنستغرام' },
  { icon: PhoneIncoming, name: 'المكالمات' },
] as const

export function Hero() {
  return (
    <Section id="top" tone="background" className="relative overflow-hidden border-b border-border" labelledBy="hero-title">
      <div className="relative grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <p className="text-sm font-semibold text-primary">موظف الاستقبال الرقمي لشركتك</p>

          <h1
            id="hero-title"
            className="mt-5 text-[2.15rem] leading-[1.45] text-text sm:text-[3.25rem] sm:leading-[1.35]"
          >
            كل عميل يجد من يرد عليه، في كل وقت.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-8 text-text-muted sm:text-lg sm:leading-9">
            KAYAN AI يرد على عملائك في واتساب وإنستغرام والهاتف من معلومات شركتك، يؤهّل الطلب، يحجز
            الموعد، ويسلّم فريقك محادثة مرتبة في لوحة واحدة.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryCta href="/signup" className="min-h-12 px-6">
              ابدأ مجانًا
              <ArrowLeft size={16} aria-hidden="true" />
            </PrimaryCta>
            <SecondaryCta href="/how-it-works" className="min-h-12 px-6">
              شاهد كيف يعمل
            </SecondaryCta>
          </div>

          <ul className="mt-8 space-y-2.5 text-sm text-text-muted">
            {HERO_FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2.5">
                <Check size={15} aria-hidden="true" className="text-primary" />
                {fact}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-6 text-sm text-text-muted">
            <span className="text-xs font-medium text-text-muted">يعمل عبر</span>
            {CHANNELS.map(({ icon: Icon, name }) => (
              <span key={name} className="inline-flex items-center gap-2 font-medium text-text">
                <Icon size={16} aria-hidden="true" className="text-text-muted" />
                {name}
              </span>
            ))}
          </div>
        </div>

        <HeroPreview />
      </div>
    </Section>
  )
}

const STEPS = [
  { label: 'فهم الطلب', detail: 'خدمة تنظيف البشرة' },
  { label: 'تحقق من المواعيد', detail: 'متاح الخميس 5:00 و6:30' },
  { label: 'حجز الموعد', detail: 'الخميس 6:30 م' },
] as const

/** Product preview built from real interface elements with example content. */
function HeroPreview() {
  return (
    <figure className="relative" aria-label="مثال من محادثة يديرها KAYAN AI">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-raised)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-text-muted">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">سارة أحمد</p>
            <p className="mt-0.5 text-xs text-text-muted">واتساب · عميلة جديدة</p>
          </div>
          <span className="ms-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            يرد الآن
          </span>
        </div>

        <div className="grid md:grid-cols-[1fr_200px]">
          <div className="space-y-3 bg-surface-muted/60 p-5 text-[13.5px] leading-6">
            <p className="max-w-[82%] rounded-xl rounded-ss-sm border border-border bg-surface px-3.5 py-2.5 text-text">
              السلام عليكم، هل عندكم موعد لتنظيف البشرة يوم الخميس؟
            </p>
            <p className="ms-auto max-w-[86%] rounded-xl rounded-se-sm bg-primary px-3.5 py-2.5 text-primary-foreground">
              وعليكم السلام، نعم. الجلسة 45 دقيقة، والمتاح الخميس 5:00 أو 6:30 مساءً. أيهما يناسبك؟
            </p>
            <p className="max-w-[50%] rounded-xl rounded-ss-sm border border-border bg-surface px-3.5 py-2.5 text-text">
              6:30 لو سمحت
            </p>
            <div className="ms-auto flex max-w-[86%] items-center gap-3 rounded-xl border border-accent/25 bg-accent-light px-3.5 py-3">
              <CalendarCheck size={18} aria-hidden="true" className="shrink-0 text-accent" />
              <div className="text-xs leading-5">
                <p className="font-semibold text-text">تم تأكيد موعدك: الخميس 6:30 م</p>
                <p className="text-text-muted">سنرسل لك تذكيرًا قبل الموعد</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border p-5 md:border-s md:border-t-0">
            <p className="text-xs font-semibold text-text">ما قام به المساعد</p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.label} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-light text-[11px] font-semibold tabular-nums text-primary-dark">
                    {index + 1}
                  </span>
                  <div className="text-xs leading-5">
                    <p className="font-medium text-text">{step.label}</p>
                    <p className="text-text-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-text-muted">محتوى توضيحي من واجهة المنصة</figcaption>
    </figure>
  )
}
