import Link from 'next/link'
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { BrandLockup } from '@/components/site/brand'

/** Shared frame for /login and /signup — same identity as the public site. */
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
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BrandLockup />
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-background hover:text-text"
          >
            <span className="sm:hidden">الرئيسية</span>
            <span className="hidden sm:inline">العودة إلى الصفحة الرئيسية</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-text-muted">{subtitle}</p>

          <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            {children}
          </div>

          {footer ? <div className="mt-6">{footer}</div> : null}

          <p className="mt-8 flex items-start gap-2 text-xs leading-6 text-text-muted">
            <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
            <span>
              بيانات شركتك مرتبطة بحسابك فقط، ولا يمكن لأي حساب آخر الوصول إليها.
            </span>
          </p>
        </div>
      </main>
    </div>
  )
}
