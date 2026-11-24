'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Bot, BookOpen, Brain, Building2, CalendarDays, ChevronLeft, CircleDollarSign, Clock3, Contact, FileText, Globe, KeyRound, ListTodo, LogOut, MapPin, Megaphone, Moon, RadioTower, Shield, SlidersHorizontal, Users, Workflow, Zap, MessageSquareText, Sparkles, Settings2 } from 'lucide-react'
import { signOutAction } from '@/lib/auth/actions'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { PasswordForm } from './password-form'
import { CapabilityManager } from './capability-manager'
import { roleLabel } from '@/lib/i18n/labels'

type CapabilityRow = { id: string; name: string; description: string; enabled: boolean }
const groups = [
  { title: 'إدارة النشاط', items: [
    { href:'/dashboard/appointments',title:'المواعيد',description:'الحجوزات ومتابعتها',icon:CalendarDays,capability:'appointments' },
    { href:'/dashboard/services',title:'الخدمات',description:'خدمات وأسعار النشاط',icon:SlidersHorizontal,capability:'appointments' },
    { href:'/dashboard/hours',title:'ساعات العمل',description:'أيام وساعات استقبال العملاء',icon:Clock3 },
    { href:'/dashboard/locations',title:'الفروع والمواقع',description:'عناوين ومواقع نشاطك',icon:MapPin },
    { href:'/dashboard/leads',title:'العملاء المحتملون',description:'متابعة الفرص وحالاتها',icon:Users,capability:'lead_capture' },
    { href:'/dashboard/team',title:'الفريق والصلاحيات',description:'الأعضاء والأدوار',icon:Users },
    { href:'/dashboard/tasks',title:'المهام والمتابعات',description:'الأعمال التي تحتاج إجراءً',icon:ListTodo },
  ]},
  { title: 'المساعد والقنوات', items: [
    { href:'/dashboard/agent',title:'المساعد الذكي',description:'إعداد الوكيل واختباره',icon:Bot },
    { href:'/dashboard/assistant?tab=memory',title:'الذاكرة الشخصية',description:'إدارة معلوماتك المحفوظة الخاصة بك',icon:Brain,personalAssistant:true },
    { href:'/dashboard/knowledge',title:'قاعدة المعرفة',description:'معلومات النشاط ومصادر الإجابة',icon:BookOpen,capability:'knowledge_base' },
    { href:'/dashboard/channels',title:'القنوات والربط',description:'واتساب والقنوات المتصلة',icon:RadioTower },
    { href:'/dashboard/integrations',title:'التكاملات',description:'الخدمات والاتصالات الخارجية',icon:Zap },
    { href:'/dashboard/copilot',title:'Copilot',description:'مساعد أدوات العمل',icon:Sparkles },
    { href:'/dashboard/workflows',title:'الأتمتة ومسارات العمل',description:'قواعد التشغيل والتدفقات',icon:Workflow },
  ]},
  { title: 'النمو والمبيعات', items: [
    { href:'/dashboard/campaigns',title:'الحملات',description:'رسائل تسويقية مع التحقق من الموافقة',icon:Megaphone,capability:'campaigns' },
    { href:'/dashboard/quotes',title:'عروض الأسعار',description:'العروض المرسلة وحالاتها',icon:FileText,capability:'sales' },
    { href:'/dashboard/orders',title:'الطلبات',description:'سجل الطلبات وحالات التنفيذ',icon:Contact,capability:'sales' },
    { href:'/dashboard/billing',title:'الباقات والاستهلاك',description:'الخطة وحدود الاستخدام والفوترة',icon:CircleDollarSign },
    { href:'/dashboard/website-pages',title:'صفحات الموقع',description:'محتوى وصفحات النشاط',icon:FileText },
    { href:'/dashboard/notifications',title:'الإشعارات',description:'التنبيهات وسجلها',icon:Bell },
  ]},
  { title: 'الأدوات المتقدمة', items: [
    { href:'/dashboard/settings/canned-replies',title:'الردود الجاهزة',description:'عبارات سريعة لفريقك',icon:MessageSquareText,capability:'inbox' },
    { href:'/dashboard/settings/escalation',title:'سياسات التصعيد',description:'قواعد التحويل ومهل الاستجابة',icon:Shield,capability:'inbox' },
    { href:'/dashboard/settings/api-keys',title:'مفاتيح API',description:'مفاتيح الربط البرمجي',icon:KeyRound,adminOnly:true },
  ]},
]

export function SettingsHub(props: {
  organizationName:string; accountId:string; accountIdentity:string; role:string;
  setupComplete:boolean; planName:string; subscriptionStatus:string;
  capabilityRows:CapabilityRow[]; isAdmin:boolean; personalAssistantEnabled:boolean;
}) {
  const [query,setQuery]=useState('')
  const visibleGroups=useMemo(()=>groups.map(group=>({
    ...group,
    items:group.items.filter(item=>{
      if ('personalAssistant' in item && item.personalAssistant && !props.personalAssistantEnabled) return false
      if ('adminOnly' in item && item.adminOnly && !props.isAdmin) return false
      if ('capability' in item && item.capability && !props.capabilityRows.some(row=>row.id===item.capability && row.enabled)) return false
      const term=query.trim().toLocaleLowerCase()
      return !term || (group.title+' '+item.title+' '+item.description).toLocaleLowerCase().includes(term)
    })
  })).filter(group=>group.items.length>0),[props.capabilityRows,props.isAdmin,props.personalAssistantEnabled,query])

  return (
    <div className="space-y-5">
      <header><h1 className="text-xl font-extrabold text-text">الإعدادات ومركز الإدارة</h1><p className="mt-1 text-xs leading-5 text-text-muted">كل خيارات مساحة العمل وأدواتها في مكان واحد.</p></header>
      <div className="relative">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted"><Settings2 size={17}/></span>
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث في الإعدادات والصفحات..." aria-label="البحث في الإعدادات" className="min-h-12 w-full rounded-2xl border border-border bg-surface pe-4 ps-11 text-sm text-text outline-none focus:border-secondary focus:ring-2 focus:ring-primary/40"/>
      </div>
      <section className="dashboard-workspace-card">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary-dark"><Building2 size={22}/></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-primary/75">مساحة العمل</p><h2 className="mt-1 truncate text-base font-extrabold text-primary">{props.organizationName}</h2><span className="mt-2 inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">{props.setupComplete?'الوكيل مفعّل':'الإعداد قيد الاكتمال'}</span></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-primary/15 pt-3">
          <div><p className="text-[10px] text-primary/65">معرّف الحساب</p><p className="mt-1 truncate text-[11px] font-semibold text-primary" dir="ltr">{props.accountId}</p></div>
          <div><p className="text-[10px] text-primary/65">الاشتراك</p><p className="mt-1 text-xs font-bold text-primary">{props.planName} · {props.subscriptionStatus}</p></div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3"><span className="truncate text-[11px] text-primary/75">{roleLabel(props.role)} · {props.accountIdentity}</span><Link href="/dashboard/billing" className="shrink-0 rounded-full bg-primary px-3 py-2 text-[11px] font-bold text-primary-dark">إدارة الباقة</Link></div>
        <form action={signOutAction} className="mt-3"><button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 text-xs font-bold text-primary"><LogOut size={15}/> تسجيل الخروج</button></form>
      </section>
      <section className="space-y-2.5">
        <h2 className="text-sm font-extrabold text-text">تفضيلات النظام</h2>
        <div className="dashboard-card divide-y divide-border px-3">
          <div className="flex min-h-[68px] items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-secondary"><Moon size={19}/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-text">المظهر</p><p className="text-[10px] text-text-muted">التبديل بين الوضع الفاتح والداكن</p></div><ThemeToggle/></div>
          <div className="flex min-h-[68px] items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-secondary"><Globe size={19}/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-text">لغة الواجهة</p><p className="text-[10px] text-text-muted">العربية · اتجاه من اليمين إلى اليسار</p></div><span className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-bold text-text-muted">العربية</span></div>
          <Link href="/dashboard/notifications" className="flex min-h-[68px] items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-secondary"><Bell size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-sm text-text">الإشعارات</strong><small className="text-[10px] text-text-muted">عرض التنبيهات وسجلها</small></span><ChevronLeft size={17}/></Link>
          <Link href="/dashboard/account" className="flex min-h-[68px] items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-secondary"><Contact size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-sm text-text">بيانات الحساب</strong><small className="text-[10px] text-text-muted">معلومات المؤسسة والحساب</small></span><ChevronLeft size={17}/></Link>
          <Link href="/dashboard/settings/vertical" className="flex min-h-[68px] items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-secondary"><SlidersHorizontal size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-sm text-text">إعداد النشاط والوكيل</strong><small className="text-[10px] text-text-muted">تسميات القطاع وتعليمات المساعد</small></span><ChevronLeft size={17}/></Link>
        </div>
      </section>
      {visibleGroups.length ? visibleGroups.map(group=>(
        <section key={group.title} className="space-y-2.5">
          <h2 className="text-sm font-extrabold text-text">{group.title}</h2>
          <div className="dashboard-card divide-y divide-border px-3">
            {group.items.map(({href,title,description,icon:Icon})=>(
              <Link key={href} href={href} className="flex min-h-[66px] items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light/70 text-secondary"><Icon size={19}/></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm text-text">{title}</strong><small className="mt-0.5 block text-[10px] leading-4 text-text-muted">{description}</small></span>
                <ChevronLeft size={17} className="shrink-0 text-text-muted"/>
              </Link>
            ))}
          </div>
        </section>
      )) : <div className="dashboard-card p-6 text-center text-sm text-text-muted">لا توجد إعدادات تطابق البحث.</div>}
      <section id="security" className="dashboard-card space-y-4 p-4"><div><h2 className="text-sm font-extrabold text-text">أمان الحساب</h2><p className="mt-1 text-[11px] text-text-muted">تغيير كلمة المرور للحساب الحالي.</p></div><PasswordForm/></section>
      {props.isAdmin ? <section className="dashboard-card space-y-3 p-4"><div><h2 className="text-sm font-extrabold text-text">تفعيل ميزات مساحة العمل</h2><p className="mt-1 text-[11px] text-text-muted">تظهر الميزات المتاحة وفق خطة المؤسسة وصلاحياتها.</p></div><CapabilityManager rows={props.capabilityRows}/></section> : null}
    </div>
  )
}
