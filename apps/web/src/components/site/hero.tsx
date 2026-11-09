import { ArrowLeft, CalendarCheck, Check, Camera, MessageCircle, PhoneIncoming } from 'lucide-react'
import { Section } from './section'
import { PrimaryCta, SecondaryCta } from './cta'

const HERO_FACTS = ['إعداد موجّه خطوة بخطوة', 'واجهة وردود عربية بالكامل', 'تحويل المحادثة لموظف عند الحاجة'] as const

const STATS = [
  { value: '24/7', label: 'استقبال بلا انقطاع' },
  { value: '1', label: 'لوحة لكل فريقك' },
  { value: '3', label: 'قنوات في صندوق واحد' },
] as const

export function Hero() {
  return (
    <Section id="top" tone="background" className="relative overflow-hidden border-b border-border" labelledBy="hero-title">
      <div className="bg-grid-light pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden="true" />
      <div className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            موظف الاستقبال الرقمي لشركتك
          </p>

          <h1 id="hero-title" className="mt-6 text-[2.1rem] font-bold leading-[1.3] text-text sm:text-5xl sm:leading-[1.25]">
            لا تُفوّت أي عميل،
            <span className="block text-primary">حتى عندما يكون فريقك مشغولًا.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-8 text-text-muted sm:text-lg sm:leading-9">
            FrontDesk يرد على عملائك في واتساب وإنستغرام والهاتف من معلومات شركتك، يؤهّل الطلب، يحجز
            الموعد، ويسلّم فريقك محادثة مرتبة في لوحة واحدة.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryCta href="/signup" className="min-h-12 px-6">
              ابدأ مجانًا
              <ArrowLeft size={16} aria-hidden="true" />
            </PrimaryCta>
            <SecondaryCta href="/how-it-works" className="min-h-12 px-6">
              شاهد كيف يعمل
            </SecondaryCta>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
            {HERO_FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <Check size={15} aria-hidden="true" className="text-primary" />
                {fact}
              </li>
            ))}
          </ul>

          <dl className="mt-12 grid max-w-lg grid-cols-3 border-t border-border pt-6">
            {STATS.map((stat) => (
              <div key={stat.label} className="border-s border-border px-4 first:border-s-0 first:ps-0">
                <dt className="text-xs text-text-muted">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-text">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroPreview />
      </div>
    </Section>
  )
}

const CHANNELS = [
  { icon: MessageCircle, name: 'واتساب', count: 12, active: true },
  { icon: Camera, name: 'إنستغرام', count: 4, active: false },
  { icon: PhoneIncoming, name: 'المكالمات', count: 3, active: false },
] as const

/** Product preview built from real interface elements with example content. */
function HeroPreview() {
  return (
    <figure className="relative" aria-label="مثال من صندوق المحادثات">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-raised)]">
        <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          </div>
          <span className="text-xs font-medium text-text-muted">صندوق المحادثات</span>
        </div>

        <div className="grid sm:grid-cols-[150px_1fr]">
          <ul className="hidden space-y-1 border-e border-border p-3 sm:block">
            {CHANNELS.map(({ icon: Icon, name, count, active }) => (
              <li
                key={name}
                className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs ${
                  active ? 'bg-primary-light/50 font-semibold text-primary-dark' : 'text-text-muted'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={14} aria-hidden="true" />
                  {name}
                </span>
                <span className="tabular-nums">{count}</span>
              </li>
            ))}
          </ul>

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                س
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-text">سارة أحمد</p>
                <p className="text-xs text-text-muted">واتساب · عميلة جديدة</p>
              </div>
              <span className="ms-auto rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                تم الرد تلقائيًا
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-[13px] leading-6">
              <p className="max-w-[80%] rounded-2xl rounded-ss-md bg-background px-3.5 py-2.5 text-text">
                السلام عليكم، هل عندكم موعد لتنظيف البشرة يوم الخميس؟
              </p>
              <p className="ms-auto max-w-[85%] rounded-2xl rounded-se-md bg-primary px-3.5 py-2.5 text-primary-foreground">
                وعليكم السلام، نعم. الجلسة 45 دقيقة، والمتاح الخميس 5:00 أو 6:30 مساءً. أيهما يناسبك؟
              </p>
              <p className="max-w-[50%] rounded-2xl rounded-ss-md bg-background px-3.5 py-2.5 text-text">6:30 لو سمحت</p>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light/60 text-primary-dark">
                <CalendarCheck size={17} aria-hidden="true" />
              </span>
              <div className="text-xs leading-5">
                <p className="font-semibold text-text">موعد مؤكد: الخميس 6:30 م</p>
                <p className="text-text-muted">تنظيف البشرة · أُرسل تذكير للعميلة</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-text-muted">محتوى توضيحي من واجهة المنصة</figcaption>
    </figure>
  )
}
