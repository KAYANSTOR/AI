import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContactForm } from './contact-form'

export default async function ContactsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', org.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contacts</h1>
          <p className="text-slate-500 text-sm mt-1">
            Unified customer records across Phone, WhatsApp, and Instagram.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Add contact</h2>
          <ContactForm organizationId={org.organizationId} />
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {!contacts?.length ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No contacts yet. They will also appear automatically from channels in Phase 2.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Name</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Phone</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Email</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.full_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
