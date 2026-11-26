import { VERTICALS, type VerticalId } from '@/lib/verticals/registry'

/** Canonical sector IDs come from the shared vertical registry. */
export type BusinessTypeId = VerticalId | 'it_technology' | 'weddings_events' | 'sales' | 'appointments' | 'home_services'

export type BusinessTypeOption = {
  id: BusinessTypeId
  label: string
  hint: string
}

const ENGINE_HINTS_AR: Record<(typeof VERTICALS)[number]['baseEngine'], string> = {
  booking_engine: 'يهيئ المواعيد والردود الذكية واستقبال استفسارات العملاء تلقائياً.',
  commerce_engine: 'يهيئ إدارة الطلبات والمنتجات وعروض الأسعار ومتابعة العملاء.',
  event_engine: 'يهيئ حجوزات المواعيد والباقات وعروض الأسعار ومتابعة الطلبات.',
  lead_engine: 'يهيئ استقبال العملاء المحتملين وعروض الأسعار وتنظيم المتابعة.',
}

export const BUSINESS_TYPES: readonly BusinessTypeOption[] = VERTICALS.map((vertical) => ({
  id: vertical.id,
  label: vertical.nameAr,
  hint: vertical.id === 'personal_assistant'
    ? 'مساعد شخصي خاص لإدارة مهامك وذاكرتك وتنبيهاتك.'
    : ENGINE_HINTS_AR[vertical.baseEngine],
}))

export const DEFAULT_BUSINESS_TYPE: BusinessTypeId | '' = ''

const LEGACY_IDS = new Set(['it_technology', 'weddings_events', 'sales', 'appointments', 'home_services'])

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return BUSINESS_TYPES.some((type) => type.id === value) || LEGACY_IDS.has(value)
}
