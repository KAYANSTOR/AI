import Link from 'next/link'
import {
  BarChart3, BookOpen, Bot, CalendarDays, Contact, CreditCard,
  Megaphone, MessageSquareText, RadioTower, Workflow, ShoppingBag, Users,
} from 'lucide-react'

const services = [
  { href: '/dashboard/conversations', title: 'صندوق الوارد', description: 'رسائل العملاء', icon: MessageSquareText, capability: 'inbox' },
  { href: '/dashboard/contacts', title: 'العملاء', description: 'جهات الاتصال', icon: Contact, capability: 'lead_capture' },
  { href: '/dashboard/appointments', title: 'المواعيد', description: 'الحجوزات القادمة', icon: CalendarDays, capability: 'appointments' },
  { href: '/dashboard/services', title: 'الخدمات', description: 'إعداد الخدمات ومدتها', icon: Workflow, capability: 'appointments' },
  { href: '/dashboard/orders', title: 'الطلبات', description: 'متابعة طلبات العملاء', icon: ShoppingBag, capability: 'orders' },
  { href: '/dashboard/quotes', title: 'عروض الأسعار', description: 'إعداد ومتابعة العروض', icon: CreditCard, capability: 'quotes' },
  { href: '/dashboard/leads', title: 'الفرص', description: 'متابعة الاستفسارات', icon: Users, capability: 'lead_capture' },
  { href: '/dashboard/agent', title: 'المساعد الذكي', description: 'إعداد الوكيل', icon: Bot, capability: null },
  { href: '/dashboard/channels', title: 'القنوات', description: 'واتساب والتواصل', icon: RadioTower, capability: null },
  { href: '/dashboard/knowledge', title: 'قاعدة المعرفة', description: 'معلومات النشاط', icon: BookOpen, capability: 'knowledge_base' },
  { href: '/dashboard/campaigns', title: 'الحملات', description: 'التواصل مع الجمهور', icon: Megaphone, capability: 'campaigns' },
  { href: '/dashboard/workflows', title: 'الأتمتة', description: 'مسارات العمل', icon: Workflow, capability: null },
  { href: '/dashboard/analytics', title: 'التحليلات', description: 'متابعة الأداء', icon: BarChart3, capability: null },
  { href: '/dashboard/billing', title: 'الباقات', description: 'الخطة والاستهلاك', icon: CreditCard, capability: null },
]

export function HomeServicesGrid({ enabledCapabilities }: { enabledCapabilities: string[] }) {
  const visible = services.filter((service) =>
    service.capability === null || enabledCapabilities.includes(service.capability)
  )
  return (
    <section data-tour-target="business_services" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-text">خدمات مساحة العمل</h2>
          <p className="mt-1 text-xs text-text-muted">الوصول السريع إلى أدوات نشاطك</p>
        </div>
        <Link href="/dashboard/settings" className="text-xs font-bold text-secondary underline underline-offset-4">جميع الإعدادات</Link>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {visible.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} data-tour-target={href === '/dashboard/appointments' ? 'appointments' : href === '/dashboard/orders' ? 'orders' : href === '/dashboard/conversations' ? 'inbox' : undefined} className="dashboard-service-card">
            <span className="dashboard-service-icon"><Icon size={20} aria-hidden="true" /></span>
            <span className="block truncate text-xs font-extrabold text-text">{title}</span>
            <span className="mt-1 block line-clamp-1 text-[10px] text-text-muted">{description}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
