import { redirect } from 'next/navigation'
import { requireMember, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { HoursEditor, type ExceptionRow } from './hours-editor'
import type { DayInput } from './actions'
import { ar } from '@/lib/i18n/ar'

export default async function BusinessHoursPage() {
  let ctx
  try {
    ctx = await requireMember()
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  const [{ data: hours }, { data: exceptions }] = await Promise.all([
    ctx.supabase
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('organization_id', ctx.organizationId)
      .order('day_of_week'),
    ctx.supabase
      .from('business_hour_exceptions')
      .select('id, exception_date, is_closed, open_time, close_time, reason')
      .eq('organization_id', ctx.organizationId)
      .is('location_id', null)
      .order('exception_date'),
  ])

  const byDay = new Map((hours ?? []).map((row) => [row.day_of_week as number, row]))
  const days: DayInput[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek)
    return {
      dayOfWeek,
      openTime: (row?.open_time ?? '09:00:00').slice(0, 5),
      closeTime: (row?.close_time ?? '17:00:00').slice(0, 5),
      isClosed: row ? Boolean(row.is_closed) : true,
    }
  })

  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.hours.title}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {ar.hours.description}
        </p>
      </div>

      {!hours?.length && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          {ar.hours.notConfigured}
        </div>
      )}

      <HoursEditor
        initialDays={days}
        exceptions={(exceptions ?? []) as ExceptionRow[]}
        canManage={canManage}
        timezone={ctx.timezone}
      />
    </div>
  )
}
