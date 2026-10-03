import { ar } from '@/lib/i18n/ar'

/**
 * Canonical business types (Adaptive Business Profile — docs/PLAN.md).
 *
 * الكيان المرجعي هو جدول `business_types` في قاعدة البيانات
 * (packages/db/migrations/0003_business_types_capabilities.sql)،
 * وهذا التعريف يعكس نفس الـids لأن نموذج إنشاء الحساب يعمل قبل وجود جلسة
 * (RLS تسمح بقراءة الجداول للمستخدمين المسجّلين فقط).
 * الـtrigger في migration 0004 يتحقق من الـid ويرجع للنوع الافتراضي عند عدم وجوده.
 */
export type BusinessTypeId =
  | 'it_technology'
  | 'weddings_events'
  | 'sales'
  | 'appointments'
  | 'home_services'
  | 'custom'

export type BusinessTypeOption = {
  id: BusinessTypeId
  /** Arabic label shown in auth/onboarding UI */
  label: string
  /** Short hint shown under the label */
  hint: string
}

export const BUSINESS_TYPES: readonly BusinessTypeOption[] = [
  ...Object.entries(ar.businessTypes).map(([id, value]) => ({
    id: id as BusinessTypeId,
    ...value,
  })),
] as const

export const DEFAULT_BUSINESS_TYPE: BusinessTypeId = 'appointments'

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return BUSINESS_TYPES.some((type) => type.id === value)
}
