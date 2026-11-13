'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, LayoutDashboard, MessageSquare, Menu, TrendingUp } from 'lucide-react'
import { cx } from '@/components/ui/cx'

const tabs = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/conversations', label: 'المحادثات', icon: MessageSquare },
  { href: '/dashboard/agent', label: 'الوكيل', icon: Bot },
  { href: '/dashboard/analytics', label: 'التحليلات', icon: TrendingUp },
  { href: '/dashboard/settings', label: 'المزيد', icon: Menu },
] as const

function isTabActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }
  if (href === '/dashboard/settings') {
    const primary = ['/dashboard', '/dashboard/conversations', '/dashboard/agent', '/dashboard/analytics']
    const isPrimary = primary.some(
      (p) => pathname === p || (p !== '/dashboard' && pathname.startsWith(`${p}/`))
    )
    return pathname.startsWith('/dashboard/settings') || !isPrimary
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileTabBar() {
  const pathname = usePathname()

  // Hide tab bar inside full-screen active chat on mobile so composer has full view
  const isChatDetail = pathname.startsWith('/dashboard/conversations/') && pathname !== '/dashboard/conversations'

  if (isChatDetail) {
    return null
  }

  return (
    <nav
      aria-label="التنقل بين أقسام التطبيق"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden shadow-[0_-4px_16px_rgba(31,42,31,0.06)]"
    >
      <div className="mx-auto flex h-[76px] max-w-md items-center justify-around px-2 pt-1.5 pb-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isTabActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-1 group py-1"
            >
              <div
                className={cx(
                  'flex h-[30px] w-[58px] items-center justify-center rounded-full transition-all',
                  active
                    ? 'bg-primary-light text-primary font-bold'
                    : 'text-text-muted group-hover:text-text'
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden="true"
                />
              </div>
              <span
                className={cx(
                  'text-center leading-tight transition-colors',
                  active
                    ? 'text-[12px] font-semibold text-text'
                    : 'text-[11px] font-medium text-text-muted group-hover:text-text'
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* iOS style home indicator on mobile */}
      <div className="mx-auto h-1 w-32 rounded-full bg-text/15 mb-1" />
    </nav>
  )
}
