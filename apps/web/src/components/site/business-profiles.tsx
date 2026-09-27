'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, LayoutGrid } from 'lucide-react'
import { Chip, Section, SectionHeading } from './section'

type Profile = {
  id: string
  label: string
  audience: string
  focus: readonly string[]
  /**
   * الوحدات الافتراضية لهذا النشاط — تعكس جدول business_type_capabilities
   * في packages/db/migrations/0003_business_types_capabilities.sql.
   */
  modules: readonly string[]
}

const PROFILES: readonly Profile[] = [
  {
    id: 'weddings_events',
    label: 'تنسيق وتنظيم الأعراس والفعاليات',
    audience: 'شركات تنسيق الأعراس ومنظّمو الفعاليات',
    focus: [
      'المناسبة',
      'التاريخ',
      'المكان',
      'عدد الضيوف',
      'الباقات',
      'الخدمات الإضافية',
      'الاستشارات والمواعيد',
      'متابعة العميل',
    ],
    modules: ['العملاء المحتملون', 'عروض الأسعار والباقات', 'الحجز والمواعيد', 'المتابعة', 'الصندوق الموحّد'],
  },
  {
    id: 'sales',
    label: 'المبيعات',
    audience: 'متاجر وموزّعون وشركات بيع المنتجات والخدمات',
    focus: [
      'المنتجات',
      'الأسعار',
      'عروض الأسعار',
      'الطلبات',
      'متابعة العملاء',
      'حالة الطلب',
    ],
    modules: ['العملاء المحتملون', 'عروض الأسعار والباقات', 'الطلبات', 'المتابعة', 'الصندوق الموحّد'],
  },
  {
    id: 'appointments',
    label: 'الحجز والمواعيد',
    audience: 'عيادات وصالونات ومراكز وخدمات تعتمد على المواعيد',
    focus: ['الخدمات', 'المدة', 'التوفر', 'الحجز', 'الإلغاء', 'إعادة الجدولة', 'التذكيرات'],
    modules: [
      'العملاء المحتملون',
      'الحجز والمواعيد',
      'المتابعة',
      'الصندوق الموحّد',
      'قاعدة معلومات الشركة',
    ],
  },
  {
    id: 'home_services',
    label: 'الخدمات المنزلية',
    audience: 'تنظيف وصيانة وتكييف وسباكة وزيارات ميدانية',
    focus: ['نوع الخدمة', 'موقع العميل', 'الموعد', 'تقدير الخدمة', 'الفني', 'متابعة الطلب'],
    modules: [
      'العملاء المحتملون',
      'الحجز والمواعيد',
      'عروض الأسعار والباقات',
      'المتابعة',
      'الصندوق الموحّد',
    ],
  },
  {
    id: 'custom',
    label: 'فئة مخصّصة',
    audience: 'أي نشاط آخر لا يندرج تحت الفئات الجاهزة',
    focus: ['وحدات عامة', 'حقول مخصّصة', 'قوالب رسائل', 'سير عمل قابل للتهيئة'],
    modules: ['العملاء المحتملون', 'الصندوق الموحّد', 'المتابعة'],
  },
] as const

export function BusinessProfiles() {
  const [activeId, setActiveId] = useState<string>(PROFILES[0].id)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function focusTab(index: number) {
    setActiveId(PROFILES[index].id)
    tabRefs.current[index]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = PROFILES.length - 1
    let next: number | null = null

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last

    if (next === null) return
    event.preventDefault()
    focusTab(next)
  }

  return (
    <Section id="profiles" tone="surface" labelledBy="profiles-title">
      <SectionHeading
        id="profiles-title"
        eyebrow="التكيّف مع نوع النشاط"
        title="اختر نشاط شركتك، فيتشكّل النظام عليه"
        description="عند إنشاء الحساب تحدّد نوع النشاط الأساسي، فيحمّل النظام الوحدات والحقول وسير العمل المناسبة — نواة واحدة، لا نسخة منفصلة لكل صناعة."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="أنواع الأنشطة"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {PROFILES.map((profile, index) => {
            const active = profile.id === activeId
            return (
              <button
                key={profile.id}
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                id={`profile-tab-${profile.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`profile-panel-${profile.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveId(profile.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`shrink-0 whitespace-nowrap rounded-xl border px-4 py-3 text-start text-sm font-semibold transition-colors lg:w-full lg:whitespace-normal ${
                  active
                    ? 'border-primary-dark bg-primary-light/25 text-text'
                    : 'border-border bg-background text-text-muted hover:border-primary-light hover:text-text'
                }`}
              >
                {profile.label}
              </button>
            )
          })}
        </div>

        <div>
          {PROFILES.map((profile) => (
            <article
              key={profile.id}
              id={`profile-panel-${profile.id}`}
              role="tabpanel"
              aria-labelledby={`profile-tab-${profile.id}`}
              hidden={profile.id !== activeId}
              className="rounded-2xl border border-border bg-background p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="brand">
                  <LayoutGrid size={14} aria-hidden="true" />
                  {profile.label}
                </Chip>
                <span className="text-xs text-text-muted">{profile.audience}</span>
              </div>

              <h3 className="mt-5 text-base font-semibold text-text">
                ما الذي يهتم به النظام في هذا النشاط؟
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {profile.focus.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" className="text-success" />
                    {item}
                  </li>
                ))}
              </ul>

              <h3 className="mt-7 text-base font-semibold text-text">الوحدات التي تُفعَّل افتراضيًا</h3>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                يمكن لصاحب الشركة تفعيل أو تعطيل أي وحدة من إعدادات الحساب، والوحدات المفعّلة هي ما
                يستطيع الوكيل الذكي استخدامه فعليًا.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {profile.modules.map((module) => (
                  <li
                    key={module}
                    className="inline-flex rounded-full border border-primary-light bg-primary-light/25 px-3 py-1.5 text-xs font-semibold text-primary-dark"
                  >
                    {module}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <p className="mt-8 text-center text-sm leading-7 text-text-muted">
        نشاطك غير موجود في القائمة؟ اختر «فئة مخصّصة» وابنِ إعداداتك من وحدات عامة وحقول مخصّصة.
      </p>
    </Section>
  )
}
