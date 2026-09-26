import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentForm } from './appointment-form'

export default async function AppointmentsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const [{ data: appointments }, { data: services }, { data: contacts }] = await Promise.all([
    supabase.from('appointments').select('*, contacts(full_name, phone), services(name)').eq('organization_id', org.organizationId).order('starts_at', { ascending: true }).limit(50),
    supabase.from('services').select('id, name, duration_minutes').eq('organization_id', org.organizationId).eq('is_active', true),
    supabase.from('contacts').select('id, full_name, phone').eq('organization_id', org.organizationId).order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Appointments</h1>
        <p className="text-slate-500 text-sm mt-1">Internal calendar (V1). Google Calendar sync comes after the AI is stable.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Book manually</h2>
          <AppointmentForm organizationId={org.organizationId} services={services ?? []} contacts={contacts ?? []} />
        </div>
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {!appointments?.length ? (
            <div className="p-10 text-center text-sm text-slate-500">No appointments scheduled.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">When</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Contact</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Service</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => {
                  const contact = a.contacts as unknown as { full_name: string | null; phone: string | null } | null
                  const service = a.services as unknown as { name: string } | null
                  return (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-900">{new Date(a.starts_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{contact?.full_name || '—'}</div>
                        <div className="text-xs text-slate-500">{contact?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{service?.name || '—'}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{a.status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
