'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { BrandLockup } from './brand'
import { PrimaryCta, SecondaryCta } from './cta'
import { SITE_NAV } from './nav'
import { InstallAppButton } from '@/components/pwa/install-app-button'

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href))
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur transition-shadow ${
        scrolled ? 'border-border shadow-xs' : 'border-border/60'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:h-20 lg:gap-6 lg:px-8">
        <BrandLockup className="shrink-0" />

        {/* Desktop navigation */}
        <nav aria-label="التنقل الرئيسي" className="hidden min-w-0 flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-0.5">
            {SITE_NAV.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={true}
                    aria-current={active ? 'page' : undefined}
                    className={`relative block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-primary-light/20 text-primary-dark'
                        : 'text-text-muted hover:bg-background hover:text-text'
                    }`}
                  >
                    {item.shortLabel}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-primary"
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-2 lg:ms-0 lg:gap-3">
          {/* Installing to the home screen only matters on touch devices; keeping it off the
              desktop bar is what lets the six links and both CTAs sit on one line. */}
          <div className="lg:hidden">
            <InstallAppButton compact />
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <SecondaryCta href="/login" className="px-4 py-2 text-sm">
              تسجيل الدخول
            </SecondaryCta>
            <PrimaryCta href="/signup" className="px-4 py-2 text-sm whitespace-nowrap">
              إنشاء حساب للشركة
            </PrimaryCta>
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary-dark hover:text-primary-dark lg:hidden"
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile quick shortcuts — always reachable without opening the menu */}
      <nav
        aria-label="روابط سريعة"
        className="border-t border-border/60 lg:hidden"
      >
        <ul className="no-scrollbar mx-auto flex w-full max-w-6xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6">
          {SITE_NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  prefetch={true}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`block whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-primary bg-primary-light/25 text-primary-dark'
                      : 'border-border text-text-muted hover:border-primary-light hover:text-text'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {open ? (
        <div id="site-mobile-menu" className="border-t border-border bg-surface lg:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              الحساب والبدء
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              <PrimaryCta href="/signup" className="w-full">
                إنشاء حساب للشركة
              </PrimaryCta>
              <SecondaryCta href="/login" className="w-full">
                تسجيل الدخول
              </SecondaryCta>
              <div className="pt-1">
                <InstallAppButton />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
