import Link from 'next/link'
import { 
  LayoutDashboard, 
  MessageSquare, 
  Calendar, 
  Users, 
  Settings, 
  PhoneCall,
  Bot
} from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessageSquare },
  { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'AI Agents', href: '/dashboard/agents', icon: Bot },
  { name: 'Telephony', href: '/dashboard/telephony', icon: PhoneCall },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-full">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
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
            return (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium"
              >
                <Icon size={18} className="text-slate-400" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-800/50">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            H
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Hashem</p>
            <p className="text-xs text-slate-400 truncate">Owner</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
