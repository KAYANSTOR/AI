import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentForm } from './appointment-form'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'
import { appointmentStatusLabel } from '@/lib/i18n/labels'

export default async function AppointmentsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const [{ data: appointments }, { data: services }, { data: contacts }] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, status, contact_id, service_id, contacts(full_name, phone), services(name)').eq('organization_id', context.organizationId).order('starts_at', { ascending: true }).limit(50),
    supabase.from('services').select('id, name, duration_minutes').eq('organization_id', context.organizationId).eq('is_active', true),
    supabase.from('contacts').select('id, full_name, phone').eq('organization_id', context.organizationId).order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.appointments.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.appointments.description}</p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-1">
          <h2 className="mb-4 font-semibold text-text">{ar.appointments.addTitle}</h2>
          <AppointmentForm organizationId={context.organizationId} services={services ?? []} contacts={contacts ?? []} />
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:col-span-2">
          {!appointments?.length ? (
            <div className="p-10 text-center text-sm text-text-muted">{ar.appointments.empty}</div>
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {appointments.map((appointment) => {
                  const contact = appointment.contacts as unknown as { full_name: string | null; phone: string | null } | null
                  const service = appointment.services as unknown as { name: string } | null
                  return (
                    <li key={appointment.id} className="space-y-2 p-4">
                      <p className="font-medium text-text">{formatDateTime(appointment.starts_at, context.timezone)}</p>
                      <p className="text-sm text-text">{contact?.full_name || ar.common.unknown}</p>
                      {contact?.phone && <p dir="ltr" className="text-start text-sm text-text-muted">{contact.phone}</p>}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-text-muted">{service?.name || ar.common.unknown}</span>
                        <span className="rounded-full bg-background px-2 py-1 text-xs text-text">
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
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text">{formatDateTime(a.starts_at, context.timezone)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{contact?.full_name || ar.common.unknown}</div>
                        {contact?.phone && <div dir="ltr" className="text-start text-xs text-text-muted">{contact.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-text-muted">{service?.name || ar.common.unknown}</td>
                      <td className="px-4 py-3 text-text-muted">{appointmentStatusLabel(String(a.status))}</td>
                    </tr>
                  )
                })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
