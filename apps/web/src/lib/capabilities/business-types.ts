import { VERTICALS, type VerticalId } from '@/lib/verticals/registry'

/** Canonical sector IDs come from the shared vertical registry. */
export type BusinessTypeId = VerticalId | 'it_technology' | 'weddings_events' | 'sales' | 'appointments' | 'home_services'

export type BusinessTypeOption = {
  id: BusinessTypeId
  label: string
  hint: string
}

export const BUSINESS_TYPES: readonly BusinessTypeOption[] = VERTICALS.map((vertical) => ({
  id: vertical.id,
  label: vertical.nameAr,
  hint: vertical.requiredFields.length
    ? `يهيئ ${vertical.enabledModules.join('، ')} ويجمع بيانات مثل ${vertical.requiredFields.slice(0, 3).join('، ')}.`
    : 'إعداد نشاط مخصص.',
}))

export const DEFAULT_BUSINESS_TYPE: BusinessTypeId = 'clinic'

const LEGACY_IDS = new Set(['it_technology', 'weddings_events', 'sales', 'appointments', 'home_services'])

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return BUSINESS_TYPES.some((type) => type.id === value) || LEGACY_IDS.has(value)
}
