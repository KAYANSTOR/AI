'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, BarChart3, BookOpen, Bot, CalendarDays, Contact, CreditCard,
  FileText, LifeBuoy, Megaphone, MessageSquareText, RadioTower, RefreshCw,
  Search, Settings, Users, Workflow,
} from 'lucide-react'
import { BrandMark, BRAND_NAME, BRAND_TAGLINE } from '@/components/site/brand'
import { GlobalSearch } from '@/components/dashboard/global-search'
import { NotificationsBell } from '@/components/dashboard/notifications-bell'
import { getLocalDateLabel } from '@/lib/i18n/current-date'
import { getVertical } from '@/lib/verticals/registry'

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

export function Header({
  organizationName,
  businessTypeId,
  timezone,
}: {
  organizationName: string
  businessTypeId: string | null
  timezone: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
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

  const today = getLocalDateLabel(timezone)

  if (isHome) {
    return (
      <header className="dashboard-home-header">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0 text-start">
            <p className="text-[11px] font-medium text-primary-dark/70">مساحة العمل</p>
            <h1 className="mt-1 truncate text-sm font-extrabold text-primary-dark">{organizationName}</h1>
            <p className="mt-1 text-[11px] text-primary-dark/70">{today || 'مرحباً بك'}</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-dark/10 bg-surface shadow-sm">
            <BrandMark className="h-11 w-11 rounded-xl" />
          </div>
          <div className="min-w-0 text-end">
            <p className="text-sm font-extrabold tracking-tight text-primary-dark">{BRAND_NAME}</p>
            <p className="mt-1 text-[10px] leading-5 text-primary-dark/70">{BRAND_TAGLINE}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link href="/dashboard/settings" aria-label="الإعدادات" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary-dark/15 bg-surface/90 text-primary-dark shadow-sm">
            <Settings size={18} aria-hidden="true" />
          </Link>
          <NotificationsBell />
          <Link href="/dashboard/account" aria-label="الحساب" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary-dark/15 bg-surface/90 text-primary-dark shadow-sm">
            <span className="text-sm font-bold">{organizationName.trim().slice(0, 1) || 'ك'}</span>
          </Link>
        </div>
      </header>
    )
  }

  return (
    <header className="dashboard-inner-header">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary-dark">
          <PageIcon size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold text-text">{page.title}</h1>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-text-muted">{page.subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => router.refresh()} aria-label="تحديث الصفحة" className="dashboard-icon-button">
          <RefreshCw size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setSearchOpen((value) => !value)} aria-label={searchOpen ? 'إغلاق البحث' : 'بحث'} aria-expanded={searchOpen} className="dashboard-icon-button">
          <Search size={18} aria-hidden="true" />
        </button>
        <Link href="/dashboard/settings" aria-label="الإعدادات" className="dashboard-icon-button">
          <Settings size={18} aria-hidden="true" />
        </Link>
      </div>
      {searchOpen ? <div className="mt-3 w-full"><GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} /></div> : null}
    </header>
  )
}
