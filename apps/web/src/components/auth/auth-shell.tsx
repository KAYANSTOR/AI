import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarCheck, MessageSquareText, PhoneIncoming, ShieldCheck } from 'lucide-react'
import { BrandLockup } from '@/components/site/brand'

const HIGHLIGHTS = [
  { icon: MessageSquareText, title: 'صندوق محادثات موحّد', text: 'واتساب وإنستغرام والموقع في مكان واحد.' },
  { icon: PhoneIncoming, title: 'رد على المكالمات', text: 'المكالمات الفائتة تُستقبل وتُسجّل تلقائيًا.' },
  { icon: CalendarCheck, title: 'حجوزات مؤكدة', text: 'المواعيد تُثبت في التقويم مع تذكير للعميل.' },
] as const

/** Shared two-column frame for /login and /signup. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-10">
          <BrandLockup />
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            الرئيسية
          </Link>
        </header>

        <main className="flex flex-1 items-start justify-center px-5 pb-12 pt-6 sm:px-10 lg:items-center lg:pt-0">
          <div className="w-full max-w-[420px]">
            <h1 className="text-[1.75rem] font-bold leading-tight text-text">{title}</h1>
            <p className="mt-2 text-sm leading-7 text-text-muted">{subtitle}</p>

            <div className="mt-8">{children}</div>

            {footer ? <div className="mt-8">{footer}</div> : null}

            <p className="mt-10 flex items-start gap-2 border-t border-border pt-5 text-xs leading-6 text-text-muted">
              <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
              <span>اتصال مشفّر، وبيانات كل شركة معزولة عن غيرها على مستوى قاعدة البيانات.</span>
            </p>
          </div>
        </main>
      </div>

      <aside className="relative hidden theme-dark overflow-hidden bg-dark text-text lg:flex lg:flex-col lg:justify-between">
        <div className="relative px-14 pt-20">
          <p className="text-sm font-semibold text-secondary">لوحة تشغيل واحدة لفريقك</p>
          <h2 className="mt-5 max-w-md text-[2rem] leading-[1.5]">
            كل عميل يتواصل معك يجد ردًا فوريًا، وكل طلب يصل إلى فريقك مرتبًا.
          </h2>
        </div>

        <ul className="relative mx-14 divide-y divide-text/10 border-y border-text/10">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-4 py-5">
              <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-sm leading-6 text-text/65">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="relative px-14 pb-10 text-xs text-text/50">© {new Date().getFullYear()} KAYAN AI</p>
      </aside>
    </div>
  )
}
