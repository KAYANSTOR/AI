'use client'

import { Menu, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell'
import { GlobalSearch } from '@/components/dashboard/global-search'
import { NotificationsBell } from '@/components/dashboard/notifications-bell'
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
  '/dashboard/copilot': ar.nav.copilot,
  '/dashboard/analytics': ar.nav.analytics,
  '/dashboard/reports': ar.nav.reports,
  '/dashboard/billing': ar.nav.billing,
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
          <div className="hidden w-full max-w-sm lg:block">
            <GlobalSearch />
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
          <NotificationsBell />
        </div>
      </div>

      {searchOpen && (
        <div id="mobile-dashboard-search" className="border-t border-border px-4 py-3 lg:hidden">
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  )
}
