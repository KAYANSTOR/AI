import type { DbClient } from '@/lib/db/client'
import type { createClient } from '@/lib/db/server'

export type AppointmentAvailability = {
  available: boolean
  conflict?: { id: string; starts_at: string; ends_at: string; status: string }
}

export async function checkAppointmentAvailability(
  db: DbClient | Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  serviceId: string,
  startsAt: string,
  endsAt: string
): Promise<AppointmentAvailability> {
  const { data, error } = await db
    .from('appointments')
    .select('id, starts_at, ends_at, status, service_id')
    .eq('organization_id', organizationId)
    .eq('service_id', serviceId)
    .neq('status', 'cancelled')

  if (error) throw error

  const conflict = (data ?? []).find((row) => {
    const rowStart = new Date(String(row.starts_at)).getTime()
    const rowEnd = new Date(String(row.ends_at)).getTime()
    const requestedStart = new Date(startsAt).getTime()
    const requestedEnd = new Date(endsAt).getTime()

    return requestedStart < rowEnd && requestedEnd > rowStart
  })

  return {
    available: !conflict,
    conflict: conflict ? { id: String(conflict.id), starts_at: String(conflict.starts_at), ends_at: String(conflict.ends_at), status: String(conflict.status) } : undefined,
  }
}
