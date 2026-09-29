'use client'

import { Bell, Menu, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell'
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

export function Header() {
  const pathname = usePathname()
  const { toggle, open, triggerRef } = useDashboardShell()
  const [searchOpen, setSearchOpen] = useState(false)
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([path]) => path !== '/dashboard' && pathname.startsWith(path))?.[1] ??
    ar.nav.mobileTitle

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-16 min-w-0 items-center justify-between gap-2 ps-[max(0.75rem,env(safe-area-inset-right))] pe-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-4">
          <button
            ref={triggerRef}
            type="button"
            onClick={toggle}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-background hover:text-text lg:hidden"
            aria-label={open ? ar.header.closeMenu : ar.header.openMenu}
            aria-expanded={open}
            aria-controls="dashboard-sidebar"
          >
            {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
          </button>
          <h1 className="min-w-0 truncate text-base font-semibold text-text">{title}</h1>
          <div className="relative hidden w-full max-w-sm lg:block">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute start-2.5 top-2.5 text-text-muted"
          />
          <input
            type="text"
            placeholder={ar.header.searchPlaceholder}
            aria-label={ar.header.searchPlaceholder}
            className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pe-4 ps-9 text-base transition-all focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
          />
        </div>
        </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <button
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-background lg:hidden"
          aria-label={searchOpen ? ar.header.closeSearch : ar.header.openSearch}
          aria-expanded={searchOpen}
          aria-controls="mobile-dashboard-search"
        >
          {searchOpen ? <X size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
        </button>
        <InstallAppButton compact />
        <button
          type="button"
          aria-label={ar.header.notifications}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-background hover:text-text"
        >
          <Bell size={20} aria-hidden="true" />
        </button>
      </div>
      </div>
      {searchOpen && (
        <div id="mobile-dashboard-search" className="border-t border-border px-4 py-3 lg:hidden">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="absolute start-3 top-3 text-text-muted" />
            <input
              type="search"
              placeholder={ar.header.searchPlaceholder}
              aria-label={ar.header.searchPlaceholder}
              className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pe-3 ps-10 text-base focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  )
}
