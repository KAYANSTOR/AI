import type { SupabaseClient } from '@supabase/supabase-js'

export type TimeSlot = {
  startsAt: string
  endsAt: string
  label: string
}

/** Postgres unique-violation, raised by ux_appointment_slot when a slot is taken. */
const UNIQUE_VIOLATION = '23505'

export class SlotUnavailableError extends Error {
  constructor() {
    super('This slot is no longer available.')
    this.name = 'SlotUnavailableError'
  }
}

type OpeningHours = { is_closed: boolean; open_time: string | null; close_time: string | null }

/**
 * Opening hours for one date.
 *
 * Reads through `holiday_aware_hours`, the same authority the database uses, so a holiday
 * or a one-off opening change is respected instead of being silently ignored. When no hours
 * are configured the function reports closed, and availability stays empty rather than
 * inventing a default schedule.
 */
export async function getOpeningHours(
  supabase: SupabaseClient,
  organizationId: string,
  dateYmd: string,
  locationId?: string | null
): Promise<OpeningHours> {
  const { data, error } = await supabase.rpc('holiday_aware_hours', {
    p_organization_id: organizationId,
    p_location_id: locationId ?? null,
    p_day: dateYmd,
  })

  if (error) throw new Error(error.message)

  // A set-returning function comes back as an array. Anything else is treated as closed:
  // availability must fail closed rather than assume the business is open.
  const rows = Array.isArray(data) ? (data as OpeningHours[]) : []
  const row = rows[0]
  if (!row) return { is_closed: true, open_time: null, close_time: null }

  return {
    is_closed: row.is_closed ?? true,
    open_time: row.open_time,
    close_time: row.close_time,
  }
}

export async function findAvailableSlots(
  supabase: SupabaseClient,
  organizationId: string,
  serviceId: string,
  dateYmd: string,
  limit = 8,
  locationId?: string | null
): Promise<TimeSlot[]> {
  const { data: service } = await supabase
    .from('services')
    .select('id, duration_minutes, is_active')
    .eq('id', serviceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!service || !service.is_active) {
    return []
  }

  const duration = service.duration_minutes ?? 60
  const hours = await getOpeningHours(supabase, organizationId, dateYmd, locationId)

  if (hours.is_closed || !hours.open_time || !hours.close_time) {
    return []
  }

  const dayStart = parseTimeOnDate(dateYmd, hours.open_time)
  const dayEnd = parseTimeOnDate(dateYmd, hours.close_time)
  if (!dayStart || !dayEnd || dayEnd <= dayStart) return []

  const { data: booked } = await supabase
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .gte('starts_at', dayStart.toISOString())
    .lt('starts_at', dayEnd.toISOString())

  const busy = (booked ?? []).map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }))

  const slots: TimeSlot[] = []
  const stepMs = 30 * 60 * 1000
  const durationMs = duration * 60 * 1000
  let cursor = dayStart.getTime()

  while (cursor + durationMs <= dayEnd.getTime() && slots.length < limit) {
    const slotEnd = cursor + durationMs
    const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start)
    if (!overlaps) {
      const startsAt = new Date(cursor).toISOString()
      const endsAt = new Date(slotEnd).toISOString()
      slots.push({
        startsAt,
        endsAt,
        label: formatLabel(startsAt),
      })
    }
    cursor += stepMs
  }

  return slots
}

function parseTimeOnDate(dateYmd: string, time: string): Date | null {
  const parts = time.split(':')
  if (parts.length < 2) return null
  const hh = parts[0].padStart(2, '0')
  const mm = parts[1].padStart(2, '0')
  const d = new Date(`${dateYmd}T${hh}:${mm}:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatLabel(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().slice(11, 16) + ' UTC'
}

export async function createAppointmentRecord(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    contactId: string
    serviceId: string
    startsAt: string
    endsAt: string
    locationId?: string | null
    notes?: string
  }
) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: args.organizationId,
      contact_id: args.contactId,
      service_id: args.serviceId,
      starts_at: args.startsAt,
      ends_at: args.endsAt,
      status: 'confirmed',
      notes: args.notes ?? null,
    })
    .select('id, starts_at, ends_at, status')
    .single()

  if (error) {
    // ux_appointment_slot is authoritative: a racing writer lost the slot.
    if (error.code === UNIQUE_VIOLATION) throw new SlotUnavailableError()
    throw new Error(error.message)
  }
  return data
}
