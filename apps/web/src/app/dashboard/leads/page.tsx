import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  qualified: 'bg-primary-light/30 text-primary-dark',
  contacted: 'bg-amber-50 text-amber-700',
  booked: 'bg-emerald-50 text-emerald-700',
  waiting: 'bg-slate-100 text-slate-700',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-rose-50 text-rose-700',
  recovered: 'bg-primary-light/30 text-primary-dark',
}

export default async function LeadsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('*, contacts(full_name, phone)')
    .eq('organization_id', org.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads</h1>
        <p className="text-slate-500 text-sm mt-1">Pipeline from first contact to booked appointment. Recovery sequences come in Phase 3.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {!leads?.length ? (
          <div className="p-10 text-center text-sm text-slate-500">No leads yet. They will be created automatically by the AI when channels go live.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left font-medium text-slate-600 px-4 py-3">Contact</th>
                <th className="text-left font-medium text-slate-600 px-4 py-3">Status</th>
                <th className="text-left font-medium text-slate-600 px-4 py-3">Intent</th>
                <th className="text-left font-medium text-slate-600 px-4 py-3">Value</th>
                <th className="text-left font-medium text-slate-600 px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const contact = lead.contacts as unknown as { full_name: string | null; phone: string | null } | null
                return (
                  <tr key={lead.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{contact?.full_name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{contact?.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[lead.status] ?? 'bg-slate-100 text-slate-700'}`}>{lead.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lead.intent || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.estimated_value != null ? `$${Number(lead.estimated_value).toFixed(0)}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
