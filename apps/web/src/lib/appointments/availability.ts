import type { SupabaseClient } from '@supabase/supabase-js'

export type DayAvailability = {
  isClosed: boolean
  openTime: string | null
  closeTime: string | null
  source: 'exception' | 'weekly' | 'default_closed'
}

/**
 * Uses DB function holiday_aware_hours when available; falls back to explicit queries.
 */
export async function getDayAvailability(
  supabase: SupabaseClient,
  input: { organizationId: string; locationId?: string | null; day: string }
): Promise<DayAvailability> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('holiday_aware_hours', {
    p_organization_id: input.organizationId,
    p_location_id: input.locationId ?? null,
    p_day: input.day,
  })

  if (!rpcError && Array.isArray(rpcData) && rpcData[0]) {
    const row = rpcData[0] as {
      is_closed: boolean
      open_time: string | null
      close_time: string | null
    }
    return {
      isClosed: Boolean(row.is_closed),
      openTime: row.open_time,
      closeTime: row.close_time,
      source: 'exception',
    }
  }

  // Fallback: exception then weekly hours
  const { data: exception } = await supabase
    .from('business_hour_exceptions')
    .select('is_closed, open_time, close_time, location_id')
    .eq('organization_id', input.organizationId)
    .eq('exception_date', input.day)
    .or(
      input.locationId
        ? `location_id.is.null,location_id.eq.${input.locationId}`
        : 'location_id.is.null'
    )
    .order('location_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (exception) {
    return {
      isClosed: Boolean(exception.is_closed),
      openTime: exception.open_time,
      closeTime: exception.close_time,
      source: 'exception',
    }
  }

  const dow = new Date(`${input.day}T12:00:00Z`).getUTCDay()
  const { data: weekly } = await supabase
    .from('business_hours')
    .select('is_closed, open_time, close_time')
    .eq('organization_id', input.organizationId)
    .eq('day_of_week', dow)
    .maybeSingle()

  if (weekly) {
    return {
      isClosed: Boolean(weekly.is_closed),
      openTime: weekly.open_time,
      closeTime: weekly.close_time,
      source: 'weekly',
    }
  }

  return { isClosed: true, openTime: null, closeTime: null, source: 'default_closed' }
}
