'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, ArrowRight, BarChart3, BookOpen, Bot, Brain, CalendarDays, Contact, CreditCard,
  FileText, LifeBuoy, Megaphone, MessageSquareText, RadioTower,
  Search, Settings, Users, Workflow, X,
} from 'lucide-react'
import { BrandMark, BRAND_NAME, BRAND_TAGLINE } from '@/components/site/brand'
import { GlobalSearch } from '@/components/dashboard/global-search'
import { NotificationsBell } from '@/components/dashboard/notifications-bell'
import { getLocalDateLabel } from '@/lib/i18n/current-date'
import { getVertical } from '@/lib/verticals/registry'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'

const PAGE_META = [
  { prefix: '/dashboard/contacts', title: 'جهات الاتصال', subtitle: 'إدارة بيانات العملاء ووسائل التواصل', icon: Contact },
  { prefix: '/dashboard/conversations', title: 'صندوق الوارد', subtitle: 'تابع محادثات العملاء ورسائلهم', icon: MessageSquareText },
  { prefix: '/dashboard/analytics', title: 'التقارير والتحليلات', subtitle: 'راقب نشاط مؤسستك من البيانات الفعلية', icon: BarChart3 },
  { prefix: '/dashboard/reports', title: 'التقارير المحفوظة', subtitle: 'التقارير المجدولة وسجل تشغيلها', icon: FileText },
  { prefix: '/dashboard/appointments', title: 'المواعيد', subtitle: 'مواعيد العملاء ومتابعتها', icon: CalendarDays },
  { prefix: '/dashboard/leads', title: 'العملاء المحتملون', subtitle: 'الاستفسارات والفرص الجديدة', icon: Users },
  { prefix: '/dashboard/services', title: 'الخدمات', subtitle: 'إدارة ما تقدمه للعملاء', icon: Workflow },
  { prefix: '/dashboard/quotes', title: 'عروض الأسعار', subtitle: 'إعداد عروض الأسعار ومتابعتها', icon: CreditCard },
  { prefix: '/dashboard/orders', title: 'الطلبات', subtitle: 'متابعة طلبات العملاء', icon: Contact },
  { prefix: '/dashboard/agent', title: 'المساعد الذكي', subtitle: 'إعداد الوكيل واختباره وتدريبه', icon: Bot },
  { prefix: '/dashboard/assistant/memories', title: 'الذاكرة الشخصية', subtitle: 'إدارة معلوماتك الخاصة بالمساعد', icon: Brain },
  { prefix: '/dashboard/assistant', title: 'Kayan AI الشخصي', subtitle: 'مساعد تنفيذي بموافقة ومحضر أعمال', icon: Bot },
  { prefix: '/dashboard/channels', title: 'القنوات', subtitle: 'إدارة قنوات التواصل والربط', icon: RadioTower },
  { prefix: '/dashboard/knowledge', title: 'قاعدة المعرفة', subtitle: 'المعلومات التي يعتمد عليها المساعد', icon: BookOpen },
  { prefix: '/dashboard/campaigns', title: 'الحملات', subtitle: 'إعداد حملات التواصل ومراجعتها', icon: Megaphone },
  { prefix: '/dashboard/billing', title: 'الباقات والاستهلاك', subtitle: 'راجع خطتك وحدود الاستخدام', icon: CreditCard },
  { prefix: '/dashboard/settings', title: 'الإعدادات', subtitle: 'إدارة مساحة العمل والتفضيلات', icon: Settings },
  { prefix: '/dashboard/team', title: 'الفريق والصلاحيات', subtitle: 'إدارة أعضاء مساحة العمل', icon: Users },
  { prefix: '/dashboard/workflows', title: 'مسارات العمل', subtitle: 'الأتمتة وقواعد التشغيل', icon: Workflow },
  { prefix: '/dashboard/website-pages', title: 'صفحات الموقع', subtitle: 'إدارة صفحات نشاطك', icon: FileText },
  { prefix: '/dashboard/integrations', title: 'التكاملات', subtitle: 'الاتصالات والخدمات المرتبطة', icon: Activity },
  { prefix: '/dashboard/tasks', title: 'المهام والمتابعات', subtitle: 'الأعمال التي تحتاج إلى إجراء', icon: LifeBuoy },
]

function parentPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length > 2 ? '/' + parts.slice(0, -1).join('/') : '/dashboard'
}

/**
 * Mobile-first RTL top bar on the unified brand palette (pastel green
 * #D8E2D0, olive #1F3B22, yellow #F2D600). Every action is a 44px target: back, search,
 * notifications and account. Settings stays reachable from the home header
 * and the account page, keeping inner headers uncluttered.
 */
export function Header({
  organizationName,
  businessTypeId,
  timezone,
  showBusinessSearch = true,
}: {
  organizationName: string
  businessTypeId: string | null
  timezone: string
  showBusinessSearch?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const { dismissForNavigation } = useHistoryDismiss(searchOpen, closeSearch)
  const isHome = pathname === '/dashboard'
  const vertical = getVertical(businessTypeId)
  const meta = PAGE_META
    .filter((item) => pathname === item.prefix || pathname.startsWith(item.prefix + '/'))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]
  const verticalTitle = pathname.startsWith('/dashboard/appointments') ? vertical.labels.appointments
    : pathname.startsWith('/dashboard/leads') ? vertical.labels.leads
    : pathname.startsWith('/dashboard/contacts') ? vertical.labels.contacts
    : pathname.startsWith('/dashboard/services') ? vertical.labels.services
    : pathname.startsWith('/dashboard/quotes') ? vertical.labels.quotes
    : pathname.startsWith('/dashboard/orders') ? vertical.labels.orders
    : null
  const page = meta
    ? { ...meta, title: verticalTitle ?? meta.title }
    : { title: 'مساحة العمل', subtitle: 'إدارة نشاطك من مكان واحد', icon: Activity }
  const PageIcon = page.icon
  const initial = organizationName.trim().slice(0, 1) || 'ك'
  const today = getLocalDateLabel(timezone)

  function goBack() {
    // Stay inside the app: use history only when the previous entry is ours.
    const sameOrigin = typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin)
    if (sameOrigin && window.history.length > 1) router.back()
    else router.push(parentPath(pathname))
  }

  const searchToggle = (
    <button
      type="button"
      onClick={() => setSearchOpen((value) => !value)}
      aria-label={searchOpen ? 'إغلاق البحث' : 'بحث'}
      aria-expanded={searchOpen}
      className="kayan-header-action"
    >
      {searchOpen ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
    </button>
  )
  const accountLink = (
    <Link href="/dashboard/account" data-tour-target="account" aria-label="الحساب" className="kayan-header-action kayan-header-avatar">
      <span className="text-sm font-bold">{initial}</span>
    </Link>
  )
  const searchPanel = showBusinessSearch && searchOpen ? (
    <div className="kayan-header-search">
      <GlobalSearch autoFocus onNavigate={dismissForNavigation} />
    </div>
  ) : null

  if (isHome) {
    return (
      <header className="dashboard-home-header kayan-header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-sm">
              <BrandMark className="h-9 w-9 rounded-xl" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{organizationName || BRAND_NAME}</p>
              <p className="mt-0.5 truncate text-[11px] opacity-75">{today || BRAND_TAGLINE}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {showBusinessSearch && searchToggle}
            <NotificationsBell />
            <Link href="/dashboard/settings" aria-label="الإعدادات" className="kayan-header-action">
              <Settings size={18} aria-hidden="true" />
            </Link>
            {accountLink}
          </div>
        </div>
        {searchPanel}
      </header>
    )
  }

  return (
    <header className="dashboard-inner-header kayan-header">
      <div className="flex w-full items-center gap-2">
        <button type="button" onClick={goBack} aria-label="رجوع" className="kayan-header-action">
          <ArrowRight size={19} aria-hidden="true" />
        </button>
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl kayan-header-page-icon min-[380px]:flex">
          <PageIcon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-extrabold">{page.title}</h1>
          <p className="mt-0.5 truncate text-[11px] opacity-75">{page.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showBusinessSearch && searchToggle}
          <NotificationsBell />
          {accountLink}
        </div>
      </div>
      {searchPanel}
    </header>
  )
}
