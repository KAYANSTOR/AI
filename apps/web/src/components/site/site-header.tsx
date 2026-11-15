'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { BrandLockup } from './brand'
import { PrimaryCta, SecondaryCta } from './cta'
import { SITE_NAV } from './nav'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLockup />

        <nav aria-label="التنقل الرئيسي" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href))

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={true}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active ? 'text-text' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text">
            تسجيل الدخول
          </Link>
          <PrimaryCta href="/signup" className="min-h-10 px-4">
            ابدأ مجانًا
          </PrimaryCta>
        </div>

        <InstallAppButton compact />

        <ThemeToggle />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-mobile-menu"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-border-strong lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open ? (
        <div id="site-mobile-menu" className="border-t border-border bg-surface lg:hidden">
          <nav aria-label="التنقل الرئيسي — الجوال" className="mx-auto w-full max-w-6xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <ul className="flex flex-col gap-1">
              {SITE_NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href))

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={true}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-primary-light/40 text-secondary'
                          : 'text-text hover:bg-background'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-3">
              <PrimaryCta href="/signup" className="w-full">
                إنشاء حساب للشركة
              </PrimaryCta>
              <SecondaryCta href="/login" className="w-full">
                تسجيل الدخول
              </SecondaryCta>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
