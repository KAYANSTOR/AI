/**
 * Shared public-site navigation (server-safe: imported by header and footer).
 *
 * `shortLabel` keeps the desktop bar from overflowing with long Arabic labels, while
 * `label` stays the descriptive name used in the footer and the mobile panel.
 */
export const SITE_NAV = [
  {
    label: 'الرئيسية',
    shortLabel: 'الرئيسية',
    href: '/',
    description: 'نظرة سريعة على المنصة ومسار التشغيل',
  },
  {
    label: 'المميزات',
    shortLabel: 'المميزات',
    href: '/features',
    description: 'ما الذي يقوم به الوكيل الذكي فعليًا',
  },
  {
    label: 'طريقة العمل',
    shortLabel: 'طريقة العمل',
    href: '/how-it-works',
    description: 'من ربط القناة إلى أول رد تلقائي',
  },
  {
    label: 'الخدمات والحلول',
    shortLabel: 'الخدمات',
    href: '/services',
    description: 'الأنشطة التي تُهيّأ لها المنصة',
  },
  {
    label: 'الأسعار',
    shortLabel: 'الأسعار',
    href: '/pricing',
    description: 'الباقات وما يشمله كل مستوى',
  },
  {
    label: 'عن المنصة',
    shortLabel: 'من نحن',
    href: '/about',
    description: 'من نحن وما الذي نبنيه',
  },
] as const

export type SiteNavItem = (typeof SITE_NAV)[number]
