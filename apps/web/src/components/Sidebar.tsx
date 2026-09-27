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
  Bot,
  SlidersHorizontal,
} from 'lucide-react'

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
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-full">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-white font-bold text-xl tracking-tight"
        >
          <div className="bg-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          FrontDesk AI
        </Link>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-3">
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
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  active
                    ? 'bg-indigo-600/20 text-white'
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} className={active ? 'text-indigo-300' : 'text-slate-400'} />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-white truncate">{orgName || 'Organization'}</p>
          <p className="text-xs text-slate-500 capitalize">{role || 'member'}</p>
        </div>
      </div>
    </aside>
  )
}
