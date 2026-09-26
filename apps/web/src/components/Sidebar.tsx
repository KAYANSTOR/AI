'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  Settings,
  PhoneCall,
  Bot,
  Contact,
  Wrench,
} from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessageSquare },
  { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Contacts', href: '/dashboard/contacts', icon: Contact },
  { name: 'Services', href: '/dashboard/services', icon: Wrench },
  { name: 'AI Agents', href: '/dashboard/agents', icon: Bot },
  { name: 'Telephony', href: '/dashboard/telephony', icon: PhoneCall },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar({ orgName, role }: { orgName?: string; role?: string }) {
  const pathname = usePathname()

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
          {navItems.map((item) => {
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
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-800/50">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            {(orgName?.[0] ?? 'O').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{orgName ?? 'Organization'}</p>
            <p className="text-xs text-slate-400 truncate capitalize">{role ?? 'member'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
