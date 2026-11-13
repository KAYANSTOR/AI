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
  ListTodo,
  UserRound,
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
  badge?: string
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'العمليات والعملاء',
    items: [
      { name: ar.nav.dashboard, href: '/dashboard', icon: LayoutDashboard, capability: null },
      { name: ar.nav.conversations, href: '/dashboard/conversations', icon: MessageSquare, capability: 'inbox' },
      { name: 'المهام', href: '/dashboard/tasks', icon: ListTodo, capability: 'inbox' },
      { name: ar.nav.appointments, href: '/dashboard/appointments', icon: Calendar, capability: 'appointments' },
      { name: ar.nav.contacts, href: '/dashboard/contacts', icon: Contact, capability: 'lead_capture' },
      { name: ar.nav.leads, href: '/dashboard/leads', icon: Users, capability: 'lead_capture' },
    ],
  },
  {
    title: 'الذكاء الاصطناعي والاستقبال',
    items: [
      { name: ar.nav.agent, href: '/dashboard/agent', icon: Bot, capability: null, badge: 'AI' },
      { name: ar.nav.channels, href: '/dashboard/channels', icon: RadioTower, capability: null, badge: 'صوت / شات' },
      { name: ar.nav.knowledge, href: '/dashboard/knowledge', icon: BookOpen, capability: 'knowledge_base' },
      { name: ar.nav.hours, href: '/dashboard/hours', icon: Clock, capability: null },
    ],
  },
  {
    title: 'النظام',
    items: [
      { name: ar.nav.services, href: '/dashboard/services', icon: Wrench, capability: 'appointments' },
      { name: 'الفريق والصلاحيات', href: '/dashboard/team', icon: Users, capability: null },
      { name: 'الحساب', href: '/dashboard/account', icon: UserRound, capability: null },
      { name: ar.nav.settings, href: '/dashboard/settings', icon: Settings, capability: null },
    ],
  },
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
      className={`fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-e border-text/10 theme-dark bg-dark pt-[env(safe-area-inset-top)] text-text shadow-2xl transition-all duration-300 ease-out transform-gpu lg:static lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
        open
          ? 'translate-x-0 opacity-100 visible'
          : 'max-lg:rtl:translate-x-full max-lg:ltr:-translate-x-full max-lg:opacity-0 max-lg:invisible lg:visible lg:opacity-100'
      }`}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-label={ar.nav.sidebarLabel}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-text/10 ps-[max(1.25rem,env(safe-area-inset-right))] pe-[max(1rem,env(safe-area-inset-left))]">
        <Link
          href="/dashboard"
          prefetch={true}
          onClick={close}
          className="group flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-text transition-opacity hover:opacity-90"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
            <BrandMark className="h-5 w-5" />
          </div>
          <span className="flex items-center gap-1.5 font-bold">KAYAN AI</span>
        </Link>
        <button
          type="button"
          onClick={close}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text/80 hover:bg-text/10 hover:text-text transition-colors lg:hidden"
          aria-label={ar.header.closeMenu}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6 scrollbar-thin scrollbar-thumb-white/15">
        {navSections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => item.capability === null || enabled.has(item.capability)
          )
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title} className="space-y-1.5">
              <p className="px-3 text-[11px] font-extrabold tracking-wider text-text/40 uppercase">
                {section.title}
              </p>
              <nav aria-label={section.title} className="flex flex-col gap-0.5">
                {visibleItems.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onClick={close} />
                ))}
              </nav>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-text/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href="/dashboard/account"
          onClick={close}
          className="flex items-center gap-3 rounded-xl bg-text/5 p-2.5 transition-colors hover:bg-text/10"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-light/20 text-secondary font-bold text-sm">
            {orgName ? orgName.slice(0, 1) : 'ك'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-text">{orgName || 'المؤسسة'}</p>
            <div className="flex items-center gap-1 text-[11px] text-text/60">
              <ShieldCheck size={12} className="text-secondary shrink-0" />
              <span className="truncate">{roleLabel(role)}</span>
            </div>
          </div>
        </Link>

        <div className="mt-2 px-1 text-center">
          <a
            href="https://kayan-soft.online"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[10px] text-text/40 hover:text-secondary transition-colors"
          >
            برمجة وتطوير شركة كيان سوفت
          </a>
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
  const active =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))

  return (
    <Link
      href={item.href}
      prefetch={true}
      onClick={onClick}
      onMouseEnter={() => {
        router.prefetch(item.href)
      }}
      className={`group relative flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 transform-gpu ${
        active
          ? 'bg-primary text-primary-foreground shadow-xs font-bold'
          : 'text-text/70 hover:bg-text/10 hover:text-text'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          size={17}
          className={`shrink-0 transition-colors ${
            active ? 'text-text' : 'text-text/60 group-hover:text-text'
          }`}
          aria-hidden="true"
        />
        <span className="truncate">{item.name}</span>
      </div>

      {item.badge && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
            active
              ? 'bg-text/20 text-text'
              : 'bg-primary-light/20 text-secondary group-hover:bg-primary-light/30'
          }`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  )
}
