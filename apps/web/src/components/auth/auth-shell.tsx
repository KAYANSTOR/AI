import Link from 'next/link'
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { BrandLockup } from '@/components/site/brand'

/** Shared two-column frame for /login and /signup. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  hideFooterNotice = false,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  hideFooterNotice?: boolean
}) {
  return (
    <div dir="ltr" className="grid min-h-dvh bg-background lg:grid-cols-2">
      <div dir="rtl" className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <BrandLockup markClassName="size-10 rounded-xl" />
          <Link
            href="/"
            className="min-h-11 rounded-xl px-3.5 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            الرئيسية
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-10 pt-2 sm:px-10 lg:px-12 lg:py-12">
          <div className="w-full max-w-[420px] rounded-2xl border border-border/70 bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
            <h1 className="text-[1.75rem] font-bold leading-[1.25] text-text">{title}</h1>
            <p className="mt-2 text-sm leading-[1.7] text-text-muted">{subtitle}</p>

            <div className="mt-7">{children}</div>

            {footer ? <div className="mt-6">{footer}</div> : null}

            {!hideFooterNotice ? (
              <p className="mt-8 flex items-start gap-2 border-t border-border pt-4 text-xs leading-6 text-text-muted">
                <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
                <span>اتصال مشفّر، وبيانات كل شركة معزولة عن غيرها على مستوى قاعدة البيانات.</span>
              </p>
            ) : null}
          </div>
        </main>
      </div>

      <aside className="theme-dark relative hidden min-h-dvh overflow-hidden bg-primary-dark text-text lg:flex lg:flex-col lg:items-center lg:justify-between lg:px-14 lg:py-16">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="absolute -start-16 top-[27%] size-[min(38vw,430px)] rounded-full bg-text/[0.045]" />
          <div className="absolute end-[14%] top-[52%] size-[min(19vw,210px)] rounded-full bg-accent/15" />
        </div>
        <div className="relative z-10 mt-[8vh] text-center">
          <p className="text-2xl font-bold tracking-wide">Kayan AI</p>
          <h2 className="mt-3 text-sm font-medium text-text/80">منصة واحدة لإدارة تجربة عملائك</h2>
          <p className="mx-auto mt-7 max-w-sm text-sm leading-7 text-text/65">
            نظّم المحادثات والمواعيد والعملاء والعمليات في مساحة عمل واحدة.
          </p>
        </div>
        <p className="relative z-10 text-xs text-text/60">كل ما يحتاجه فريقك، في مكان واحد.</p>
      </aside>
    </div>
  )
}
