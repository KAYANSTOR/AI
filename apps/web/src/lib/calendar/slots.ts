import type { SupabaseClient } from '@supabase/supabase-js'

export type TimeSlot = {
  startsAt: string
  endsAt: string
  label: string
}

export async function findAvailableSlots(
  supabase: SupabaseClient,
  organizationId: string,
  serviceId: string,
  dateYmd: string,
  limit = 8
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
  const day = new Date(`${dateYmd}T12:00:00Z`).getUTCDay()

  const { data: hours } = await supabase
    .from('business_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('organization_id', organizationId)
    .eq('day_of_week', day)
    .maybeSingle()

  if (!hours || hours.is_closed) {
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

  if (error) throw new Error(error.message)
  return data
}
