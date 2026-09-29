'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  Settings,
  Contact,
  Wrench,
  SlidersHorizontal,
  ShieldCheck,
  Bot,
  RadioTower,
  Clock,
  MapPin,
  BookOpen,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { BrandMark } from '@/components/site/brand'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell'
import { ar } from '@/lib/i18n/ar'
import { roleLabel } from '@/lib/i18n/labels'

type NavItem = {
  name: string
  href: string
  icon: React.ElementType
  capability: string | null
}

const navItems: NavItem[] = [
  { name: ar.nav.dashboard, href: '/dashboard', icon: LayoutDashboard, capability: null },
  { name: ar.nav.conversations, href: '/dashboard/conversations', icon: MessageSquare, capability: 'inbox' },
  { name: ar.nav.appointments, href: '/dashboard/appointments', icon: Calendar, capability: 'appointments' },
  { name: ar.nav.leads, href: '/dashboard/leads', icon: Users, capability: 'lead_capture' },
  { name: ar.nav.contacts, href: '/dashboard/contacts', icon: Contact, capability: 'lead_capture' },
  { name: ar.nav.services, href: '/dashboard/services', icon: Wrench, capability: 'appointments' },
  { name: ar.nav.knowledge, href: '/dashboard/knowledge', icon: BookOpen, capability: 'knowledge_base' },
  { name: ar.nav.hours, href: '/dashboard/hours', icon: Clock, capability: null },
  { name: ar.nav.locations, href: '/dashboard/locations', icon: MapPin, capability: null },
  { name: ar.nav.channels, href: '/dashboard/channels', icon: RadioTower, capability: null },
  { name: ar.nav.agent, href: '/dashboard/agent', icon: Bot, capability: null },
  { name: ar.nav.setup, href: '/dashboard/setup', icon: SlidersHorizontal, capability: null },
  { name: ar.nav.settings, href: '/dashboard/settings', icon: Settings, capability: null },
]

export function Sidebar({
  orgName,
  role,
  enabledCapabilities,
}: {
  orgName: string
  role: string
  enabledCapabilities: string[]
}) {
  const pathname = usePathname()
  const { open, close } = useDashboardShell()
  const drawerRef = useRef<HTMLElement>(null)
  const enabled = new Set(enabledCapabilities)

  const visible = navItems.filter(
    (item) => item.capability === null || enabled.has(item.capability)
  )

  useEffect(() => {
    if (!open) return
    const drawer = drawerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = drawer?.querySelector<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab' || !drawer) return
      const items = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((item) => !item.hasAttribute('disabled'))
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (!firstItem || !lastItem) return
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close, open])

  return (
    <aside
      id="dashboard-sidebar"
      ref={drawerRef}
      className={`invisible fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-e border-white/10 bg-dark pt-[env(safe-area-inset-top)] text-white shadow-xl transition-transform duration-200 motion-reduce:transition-none lg:visible lg:static lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
        open
          ? 'visible translate-x-0'
          : 'invisible max-lg:rtl:translate-x-full max-lg:ltr:-translate-x-full'
      }`}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-label={ar.nav.sidebarLabel}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 ps-[max(1rem,env(safe-area-inset-right))] pe-[max(1rem,env(safe-area-inset-left))]">
        <Link
          href="/dashboard"
          onClick={close}
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-white"
        >
          <BrandMark className="h-8 w-8" />
          FrontDesk AI
        </Link>
        <button
          type="button"
          onClick={close}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 lg:hidden"
          aria-label={ar.header.closeMenu}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 px-3 text-xs font-semibold tracking-wider text-white/50">
          {ar.nav.section}
        </div>
        <nav aria-label={ar.nav.sidebarLabel} className="flex flex-col gap-1">
          {visible.map((item) => {
            const Icon = item.icon
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary/25 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} className={active ? 'text-primary-light' : 'text-white/60'} />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 px-3 py-2">
          <ShieldCheck size={16} className="shrink-0 text-primary-light" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{orgName}</p>
            <p className="text-xs text-white/60">{roleLabel(role)}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
