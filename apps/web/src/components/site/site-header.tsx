'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { BrandLockup } from './brand'
import { PrimaryCta, SecondaryCta } from './cta'
import { SITE_NAV } from './nav'
import { InstallAppButton } from '@/components/pwa/install-app-button'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

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
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
        <BrandLockup />

        <nav aria-label="التنقل الرئيسي" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-background hover:text-text"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <SecondaryCta href="/login" className="px-4 py-2 text-sm">
            تسجيل الدخول
          </SecondaryCta>
          <PrimaryCta href="/signup" className="px-4 py-2 text-sm">
            إنشاء حساب للشركة
          </PrimaryCta>
        </div>

        <InstallAppButton compact />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-mobile-menu"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary-dark hover:text-primary-dark lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open ? (
        <div id="site-mobile-menu" className="border-t border-border bg-surface lg:hidden">
            <nav aria-label="التنقل الرئيسي — الجوال" className="mx-auto w-full max-w-6xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <ul className="flex flex-col">
              {SITE_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-sm font-medium text-text transition-colors hover:bg-background"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
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
