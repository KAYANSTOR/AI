import { Suspense } from 'react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentForm } from './appointment-form'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'
import { appointmentStatusLabel } from '@/lib/i18n/labels'

export const dynamic = 'force-dynamic'

export default async function AppointmentsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.appointments.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.appointments.description}</p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Add Appointment Form (Suspense) */}
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-1">
          <h2 className="mb-4 font-semibold text-text">{ar.appointments.addTitle}</h2>
          <Suspense fallback={<AppointmentFormSkeleton />}>
            <AppointmentFormSection organizationId={context.organizationId} />
          </Suspense>
        </div>

        {/* Right: Appointments List (Suspense) */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs lg:col-span-2">
          <Suspense fallback={<AppointmentTableSkeleton />}>
            <AppointmentListSection
              organizationId={context.organizationId}
              timezone={context.timezone}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

async function AppointmentFormSection({ organizationId }: { organizationId: string }) {
  const supabase = await createClient()
  const [{ data: services }, { data: contacts }] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
    supabase
      .from('contacts')
      .select('id, full_name, phone')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <AppointmentForm
      organizationId={organizationId}
      services={services ?? []}
      contacts={contacts ?? []}
    />
  )
}

function AppointmentFormSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 rounded-xl bg-background" />
      <div className="h-10 rounded-xl bg-background" />
      <div className="h-10 rounded-xl bg-background" />
      <div className="h-11 rounded-xl bg-primary/20" />
    </div>
  )
}

async function AppointmentListSection({
  organizationId,
  timezone,
}: {
  organizationId: string
  timezone: string
}) {
  const supabase = await createClient()
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, starts_at, status, contact_id, service_id, contacts(full_name, phone), services(name)')
    .eq('organization_id', organizationId)
    .order('starts_at', { ascending: true })
    .limit(50)

  if (!appointments?.length) {
    return <div className="p-10 text-center text-sm text-text-muted">{ar.appointments.empty}</div>
  }

  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {appointments.map((appointment) => {
          const contact = appointment.contacts as unknown as { full_name: string | null; phone: string | null } | null
          const service = appointment.services as unknown as { name: string } | null
          return (
            <li key={appointment.id} className="space-y-2 p-4">
              <p className="font-medium text-text">{formatDateTime(appointment.starts_at, timezone)}</p>
              <p className="text-sm text-text">{contact?.full_name || ar.common.unknown}</p>
              {contact?.phone && <p dir="ltr" className="text-start text-sm text-text-muted">{contact.phone}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-text-muted">{service?.name || ar.common.unknown}</span>
                <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-text">
                  {appointmentStatusLabel(String(appointment.status))}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.appointments.when}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.appointments.contact}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.appointments.service}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.appointments.status}</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => {
              const contact = a.contacts as unknown as { full_name: string | null; phone: string | null } | null
              const service = a.services as unknown as { name: string } | null
              return (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                  <td className="px-4 py-3 text-text font-medium">{formatDateTime(a.starts_at, timezone)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{contact?.full_name || ar.common.unknown}</div>
                    {contact?.phone && <div dir="ltr" className="text-start text-xs text-text-muted font-mono">{contact.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{service?.name || ar.common.unknown}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-primary-light/30 px-2.5 py-0.5 text-xs font-semibold text-primary-dark">
                      {appointmentStatusLabel(String(a.status))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function AppointmentTableSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-10 rounded-xl bg-background" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-background/50" />
      ))}
    </div>
  )
}
