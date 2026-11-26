'use client'

import { useEffect, useRef, useState } from 'react'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plus, X, Home, Contact, BarChart3, MessageSquareText,
  CalendarPlus, FilePlus2, ClipboardList, Megaphone, Bot, Brain, ListTodo, Sun,
} from 'lucide-react'
import { getVertical } from '@/lib/verticals/registry'
import { dashboardNavigation, type NavigationAccess, type TabId, type QuickActionId } from '@/lib/dashboard/navigation-policy'

const tabs = {
  home: { href: '/dashboard', label: 'الرئيسية', icon: Home },
  contacts: { href: '/dashboard/contacts', label: 'العملاء', icon: Contact },
  appointments: { href: '/dashboard/appointments', label: 'المواعيد', icon: CalendarPlus },
  orders: { href: '/dashboard/orders', label: 'الطلبات', icon: ClipboardList },
  inbox: { href: '/dashboard/conversations', label: 'الوارد', icon: MessageSquareText },
  analytics: { href: '/dashboard/analytics', label: 'التقارير', icon: BarChart3 },
  assistant: { href: '/dashboard/assistant', label: 'المساعد', icon: Bot },
  tasks: { href: '/dashboard/assistant/tasks', label: 'مهامي', icon: ListTodo },
  billing: { href: '/dashboard/billing', label: 'الباقات', icon: FilePlus2 },
} satisfies Record<TabId, { href: string; label: string; icon: typeof Home }>

const quickActions = {
  contacts: { href: '/dashboard/contacts', label: 'إضافة عميل', description: 'سجّل بيانات عميل جديد', icon: Contact },
  appointments: { href: '/dashboard/appointments', label: 'موعد جديد', description: 'أضف موعداً للنشاط', icon: CalendarPlus },
  quotes: { href: '/dashboard/quotes/new', label: 'عرض سعر', description: 'أنشئ عرضاً للعميل', icon: FilePlus2 },
  orders: { href: '/dashboard/orders/new', label: 'طلب جديد', description: 'سجّل طلباً جديداً', icon: ClipboardList },
  campaigns: { href: '/dashboard/campaigns', label: 'حملة تواصل', description: 'جهّز حملة كمسودة', icon: Megaphone },
  agent: { href: '/dashboard/agent', label: 'إعداد المساعد', description: 'راجع الوكيل الذكي', icon: Bot },
  assistant: { href: '/dashboard/assistant', label: 'Kayan AI الشخصي', description: 'محادثة ومهام وموافقات', icon: Bot },
  memory: { href: '/dashboard/assistant?tab=memory', label: 'الذاكرة الشخصية', description: 'راجع ما يتذكره مساعدك', icon: Brain },
  summary: { href: '/dashboard/assistant/tasks#daily-summary', label: 'الملخص اليومي', description: 'اضبط وقت الملخص اليومي', icon: Sun },
  tools: { href: '/dashboard/assistant?tab=tools', label: 'الموصلات والخزنة', description: 'أدر أدواتك المتصلة', icon: ListTodo },
} satisfies Record<QuickActionId, { href: string; label: string; description: string; icon: typeof Home }>

export function MobileTabBar(access: NavigationAccess) {
  const pathname = usePathname()
  const vertical = getVertical(access.businessTypeId)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const { dismissForNavigation } = useHistoryDismiss(open, () => setOpen(false))
  const navigation = dashboardNavigation(access)
  const visibleTabs = navigation.tabs.map((id) => ({
    ...tabs[id],
    label: id === 'contacts' ? vertical.labels.contacts : id === 'appointments' ? vertical.labels.appointments : id === 'orders' ? vertical.labels.orders : tabs[id].label,
  }))
  const sheetActions = navigation.actions.map((id) => quickActions[id])
  const activeHref = visibleTabs.map((item) => item.href).filter((href) =>
    href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  ).sort((a, b) => b.length - a.length)[0]
  const isActive = (href: string) => activeHref === href
  const split = Math.ceil(visibleTabs.length / 2)
  const hasActions = sheetActions.length > 0

  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    const focusable = () => Array.from(sheet?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])
      .filter((item) => item.getClientRects().length > 0)
    focusable()[0]?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  function close() {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <nav data-tour-target="navigation" className="dashboard-bottom-nav" aria-label="التنقل الرئيسي">
        <div className="dashboard-bottom-nav-inner" style={{ gridTemplateColumns: hasActions ? `repeat(${split}, minmax(0, 1fr)) 68px repeat(${visibleTabs.length - split}, minmax(0, 1fr))` : `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.slice(0, split).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={'dashboard-bottom-tab' + (isActive(href) ? ' is-active' : '')}>
              <Icon size={20} strokeWidth={isActive(href) ? 2.5 : 1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          {hasActions && <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="فتح الإجراءات السريعة" aria-expanded={open} className="dashboard-fab">
            <Plus size={27} strokeWidth={2.4} aria-hidden="true" />
          </button>}
          {visibleTabs.slice(split).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={'dashboard-bottom-tab' + (isActive(href) ? ' is-active' : '')}>
              <Icon size={20} strokeWidth={isActive(href) ? 2.5 : 1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
      {open && hasActions ? (
        <div className="dashboard-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="quick-actions-title" className="dashboard-quick-sheet">
            <div className="dashboard-sheet-handle" aria-hidden="true" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="quick-actions-title" className="text-lg font-extrabold text-text">إجراءات سريعة</h2>
                <p className="mt-1 text-xs text-text-muted">اختر العملية التي تريد تنفيذها</p>
              </div>
              <button type="button" onClick={close} aria-label="إغلاق" className="dashboard-icon-button"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sheetActions.map(({ href, label, description, icon: Icon }) => (
                <Link key={href} href={href} onClick={dismissForNavigation} className="dashboard-quick-action">
                  <span className="dashboard-quick-action-icon"><Icon size={21} aria-hidden="true" /></span>
                  <span className="text-sm font-bold text-text">{label}</span>
                  <span className="text-[11px] leading-5 text-text-muted">{description}</span>
                </Link>
              ))}
            </div>
            {navigation.actions.includes('campaigns') && <p className="mt-4 text-center text-[11px] leading-5 text-text-muted">إنشاء حملة يحفظها كمسودة؛ لا يبدأ الإرسال قبل مراجعة الجمهور والموافقة.</p>}
          </section>
        </div>
      ) : null}
    </>
  )
}
