'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  Contact,
  Wrench,
  Settings,
  ShieldCheck,
  Bot,
  RadioTower,
  Clock,
  BookOpen,
  X,
  Ellipsis,
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
  { name: ar.nav.contacts, href: '/dashboard/contacts', icon: Contact, capability: 'lead_capture' },
  { name: ar.nav.agent, href: '/dashboard/agent', icon: Bot, capability: null },
  { name: ar.nav.leads, href: '/dashboard/leads', icon: Users, capability: 'lead_capture' },
  { name: ar.nav.services, href: '/dashboard/services', icon: Wrench, capability: 'appointments' },
  { name: ar.nav.knowledge, href: '/dashboard/knowledge', icon: BookOpen, capability: 'knowledge_base' },
  { name: ar.nav.hours, href: '/dashboard/hours', icon: Clock, capability: null },
  { name: ar.nav.channels, href: '/dashboard/channels', icon: RadioTower, capability: null },
  { name: ar.nav.settings, href: '/dashboard/settings', icon: Settings, capability: null },
]

const primaryHrefs = new Set([
  '/dashboard',
  '/dashboard/conversations',
  '/dashboard/appointments',
  '/dashboard/contacts',
  '/dashboard/agent',
])

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
  const moreRef = useRef<HTMLDetailsElement>(null)
  const enabled = new Set(enabledCapabilities)

  const visible = navItems.filter(
    (item) => item.capability === null || enabled.has(item.capability)
  )
  const primary = visible.filter((item) => primaryHrefs.has(item.href))
  const more = visible.filter((item) => !primaryHrefs.has(item.href))
  const activeMoreItem = more.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  useEffect(() => {
    if (moreRef.current) {
      moreRef.current.open = Boolean(activeMoreItem)
    }
  }, [activeMoreItem, pathname])

  useEffect(() => {
    if (!open) return
    const drawer = drawerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = drawer?.querySelector<HTMLElement>(
      'summary, button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
          'summary, button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((item) => !item.hasAttribute('disabled') && item.getClientRects().length > 0)
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
          {primary.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onClick={close} />)}
          {more.length ? (
            <details ref={moreRef} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-light">
                <Ellipsis size={18} className="text-white/60" aria-hidden="true" />
                المزيد
              </summary>
              <div className="mt-1 flex flex-col gap-1 border-s border-white/15 ms-5 ps-2">
                {more.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onClick={close} />)}
              </div>
            </details>
          ) : null}
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

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: NavItem
  pathname: string
  onClick: () => void
}) {
  const router = useRouter()
  const Icon = item.icon
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
  return (
    <Link
      href={item.href}
      prefetch={true}
      onClick={onClick}
      onMouseEnter={() => {
        router.prefetch(item.href)
      }}
      className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary/25 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={18} className={active ? 'text-primary-light' : 'text-white/60'} aria-hidden="true" />
      {item.name}
    </Link>
  )
}
