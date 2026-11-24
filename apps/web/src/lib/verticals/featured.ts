import { foldArabic as fold } from '@/lib/text/fold-arabic'
import { VERTICALS, type VerticalDefinition } from '@/lib/verticals/registry'

/** Sectors shown as cards before the full searchable list. */
export const FEATURED_SECTOR_IDS = ['personal_assistant', 'clinic', 'ecommerce_store', 'restaurant_cafe', 'salon_barber'] as const

export function featuredSectors(): VerticalDefinition[] {
  return FEATURED_SECTOR_IDS.map((id) => VERTICALS.find((vertical) => vertical.id === id)).filter((v): v is VerticalDefinition => Boolean(v))
}


export function searchSectors(query: string): VerticalDefinition[] {
  const needle = fold(query)
  if (!needle) return [...VERTICALS]
  return VERTICALS.filter((vertical) => fold(`${vertical.nameAr} ${vertical.id} ${vertical.labels.services ?? ''}`).includes(needle))
}
