'use client'

import { KeyRound, LogOut, Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell'
import { signOutAction } from '@/lib/auth/actions'
import { ar } from '@/lib/i18n/ar'

const pageTitles: Record<string, string> = {
  '/dashboard': ar.nav.dashboard,
  '/dashboard/conversations': ar.nav.conversations,
  '/dashboard/appointments': ar.nav.appointments,
  '/dashboard/leads': ar.nav.leads,
  '/dashboard/contacts': ar.nav.contacts,
  '/dashboard/services': ar.nav.services,
  '/dashboard/knowledge': ar.nav.knowledge,
  '/dashboard/hours': ar.nav.hours,
  '/dashboard/locations': ar.nav.locations,
  '/dashboard/channels': ar.nav.channels,
  '/dashboard/agent': ar.nav.agent,
  '/dashboard/setup': ar.nav.setup,
  '/dashboard/settings': ar.nav.settings,
}

function SearchForm({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <form action="/dashboard/conversations" method="get" role="search" className="relative w-full">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        name="q"
        placeholder={ar.header.searchPlaceholder}
        aria-label={ar.header.searchPlaceholder}
        autoFocus={autoFocus}
        className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pe-3 ps-9 text-base transition focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10 md:text-sm"
      />
    </form>
  )
}

function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="قائمة الحساب"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-dark text-sm font-semibold uppercase text-surface transition hover:ring-4 hover:ring-primary/15"
      >
        {email.slice(0, 1)}
      </button>
      {open ? (
        <div role="menu" className="absolute end-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-raised)]">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs text-text-muted">مسجّل الدخول باسم</p>
            <p className="mt-0.5 truncate text-sm font-medium text-text" dir="ltr">{email}</p>
          </div>
          <Link
            role="menuitem"
            href="/dashboard/settings#security"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-background"
          >
            <KeyRound size={15} aria-hidden="true" className="text-text-muted" />
            تغيير كلمة المرور
          </Link>
          <form action={signOutAction}>
            <button
              role="menuitem"
              type="submit"
              className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm text-error hover:bg-error/5"
            >
              <LogOut size={15} aria-hidden="true" />
              تسجيل الخروج
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

export function Header({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const { toggle, open, triggerRef } = useDashboardShell()
  const [searchOpen, setSearchOpen] = useState(false)
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([path]) => path !== '/dashboard' && pathname.startsWith(path))?.[1] ??
    ar.nav.mobileTitle

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex min-h-16 min-w-0 items-center justify-between gap-3 ps-[max(1rem,env(safe-area-inset-right))] pe-[max(1rem,env(safe-area-inset-left))] lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-6">
          <button
            ref={triggerRef}
            type="button"
            onClick={toggle}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-background hover:text-text lg:hidden"
            aria-label={open ? ar.header.closeMenu : ar.header.openMenu}
            aria-expanded={open}
            aria-controls="dashboard-sidebar"
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <h1 className="min-w-0 truncate text-base font-semibold text-text">{title}</h1>
          <div className="hidden w-full max-w-sm lg:block">
            <SearchForm />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setSearchOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-muted hover:bg-background lg:hidden"
            aria-label={searchOpen ? ar.header.closeSearch : ar.header.openSearch}
            aria-expanded={searchOpen}
            aria-controls="mobile-dashboard-search"
          >
            {searchOpen ? <X size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
          </button>
          <InstallAppButton compact />
          <AccountMenu email={userEmail} />
        </div>
      </div>
      {searchOpen ? (
        <div id="mobile-dashboard-search" className="border-t border-border px-4 py-3 lg:hidden">
          <SearchForm autoFocus />
        </div>
      ) : null}
    </header>
  )
}
