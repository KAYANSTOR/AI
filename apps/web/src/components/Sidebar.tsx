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
} from 'lucide-react'
import { BrandMark } from '@/components/site/brand'

type NavItem = {
  name: string
  href: string
  icon: React.ElementType
  capability: string | null
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, capability: null },
  { name: 'Inbox', href: '/dashboard/conversations', icon: MessageSquare, capability: 'inbox' },
  { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar, capability: 'appointments' },
  { name: 'Leads', href: '/dashboard/leads', icon: Users, capability: 'lead_capture' },
  { name: 'Contacts', href: '/dashboard/contacts', icon: Contact, capability: 'lead_capture' },
  { name: 'Services', href: '/dashboard/services', icon: Wrench, capability: 'appointments' },
  { name: 'Business setup', href: '/dashboard/setup', icon: SlidersHorizontal, capability: null },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, capability: null },
]

export function Sidebar({
  orgName,
  role,
  enabledCapabilities = [],
}: {
  orgName?: string
  role?: string
  enabledCapabilities?: string[]
}) {
  const pathname = usePathname()
  const enabled = new Set(enabledCapabilities)

  const visible = navItems.filter(
    (item) => item.capability === null || enabled.has(item.capability)
  )

  return (
    <aside className="flex h-full w-64 flex-col border-e border-white/10 bg-dark text-white">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-white"
        >
          <BrandMark className="h-8 w-8" />
          FrontDesk AI
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 px-3 text-xs font-semibold tracking-wider text-white/50 uppercase">
          Overview
        </div>
        <nav className="flex flex-col gap-1">
          {visible.map((item) => {
            const Icon = item.icon
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary/25 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} className={active ? 'text-primary-light' : 'text-white/60'} />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-2 px-3 py-2">
          <ShieldCheck size={16} className="shrink-0 text-primary-light" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{orgName || 'Organization'}</p>
            <p className="text-xs text-white/60 capitalize">{role || 'member'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
