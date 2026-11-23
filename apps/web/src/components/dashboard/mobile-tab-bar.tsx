'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plus, X, Home, Contact, BarChart3, MessageSquareText,
  CalendarPlus, FilePlus2, ClipboardList, Megaphone, Bot,
} from 'lucide-react'
import { getVertical } from '@/lib/verticals/registry'

const tabs = [
  { href: '/dashboard', label: 'الرئيسية', icon: Home },
  { href: '/dashboard/contacts', label: 'العملاء', icon: Contact },
  { href: '/dashboard/analytics', label: 'التقارير', icon: BarChart3 },
  { href: '/dashboard/conversations', label: 'الوارد', icon: MessageSquareText },
] as const

const quickActions = [
  { href: '/dashboard/contacts', label: 'إضافة عميل', description: 'سجّل بيانات عميل جديد', icon: Contact },
  { href: '/dashboard/appointments', label: 'موعد جديد', description: 'أضف موعداً للنشاط', icon: CalendarPlus },
  { href: '/dashboard/quotes/new', label: 'عرض سعر', description: 'أنشئ عرضاً للعميل', icon: FilePlus2 },
  { href: '/dashboard/orders/new', label: 'طلب جديد', description: 'سجّل طلباً جديداً', icon: ClipboardList },
  { href: '/dashboard/campaigns', label: 'حملة تواصل', description: 'جهّز حملة كمسودة', icon: Megaphone },
  { href: '/dashboard/agent', label: 'إعداد المساعد', description: 'راجع الوكيل الذكي', icon: Bot },
]

export function MobileTabBar({ businessTypeId }: { businessTypeId: string | null }) {
  const pathname = usePathname()
  const vertical = getVertical(businessTypeId)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const isActive = (href: string) => href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')
  const verticalActions = vertical.baseEngine === 'booking_engine'
    ? [{ href: '/dashboard/appointments', label: `${vertical.labels.appointments} جديد`, description: 'احجز موعداً أو جلسة', icon: CalendarPlus }, ...quickActions.filter((action) => action.href !== '/dashboard/appointments')]
    : vertical.baseEngine === 'commerce_engine'
      ? [{ href: '/dashboard/orders/new', label: `${vertical.labels.orders} جديد`, description: 'سجّل طلب عميل', icon: ClipboardList }, ...quickActions.filter((action) => action.href !== '/dashboard/orders/new' && action.href !== '/dashboard/appointments')]
      : vertical.baseEngine === 'event_engine'
        ? [{ href: '/dashboard/appointments', label: `${vertical.labels.appointments} جديد`, description: 'تحقق من التاريخ وسجّل الحجز', icon: CalendarPlus }, ...quickActions.filter((action) => action.href !== '/dashboard/appointments')]
        : [{ href: '/dashboard/leads', label: `${vertical.labels.leads} جديد`, description: 'سجّل استفساراً جديداً', icon: Contact }, ...quickActions.filter((action) => action.href !== '/dashboard/appointments')]

  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    const focusable = () => Array.from(sheet?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])
      .filter((item) => item.getClientRects().length > 0)
    focusable()[0]?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); return }
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
      <nav className="dashboard-bottom-nav" aria-label="التنقل الرئيسي">
        <div className="dashboard-bottom-nav-inner">
          {tabs.slice(0, 2).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={'dashboard-bottom-tab' + (isActive(href) ? ' is-active' : '')}>
              <Icon size={20} strokeWidth={isActive(href) ? 2.5 : 1.8} aria-hidden="true" />
              <span>{href === '/dashboard/contacts' ? vertical.labels.contacts : label}</span>
            </Link>
          ))}
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="فتح الإجراءات السريعة" aria-expanded={open} className="dashboard-fab">
            <Plus size={27} strokeWidth={2.4} aria-hidden="true" />
          </button>
          {tabs.slice(2).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={'dashboard-bottom-tab' + (isActive(href) ? ' is-active' : '')}>
              <Icon size={20} strokeWidth={isActive(href) ? 2.5 : 1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
      {open ? (
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
              {verticalActions.map(({ href, label, description, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="dashboard-quick-action">
                  <span className="dashboard-quick-action-icon"><Icon size={21} aria-hidden="true" /></span>
                  <span className="text-sm font-bold text-text">{label}</span>
                  <span className="text-[11px] leading-5 text-text-muted">{description}</span>
                </Link>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] leading-5 text-text-muted">إنشاء حملة يحفظها كمسودة؛ لا يبدأ الإرسال قبل مراجعة الجمهور والموافقة.</p>
          </section>
        </div>
      ) : null}
    </>
  )
}
