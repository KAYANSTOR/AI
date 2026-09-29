import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContactForm } from './contact-form'
import { ar } from '@/lib/i18n/ar'
import { formatDate } from '@/lib/i18n/format'

export default async function ContactsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, phone, email, created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">{ar.contacts.title}</h1>
          <p className="mt-1 text-sm text-text-muted">{ar.contacts.description}</p>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-1">
          <h2 className="mb-4 font-semibold text-text">{ar.contacts.addTitle}</h2>
          <ContactForm organizationId={context.organizationId} />
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:col-span-2">
          {!contacts?.length ? (
            <div className="p-10 text-center text-sm text-text-muted">{ar.contacts.empty}</div>
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {contacts.map((contact) => (
                  <li key={contact.id} className="space-y-1 p-4">
                    <p className="font-medium text-text">{contact.full_name || ar.common.unknown}</p>
                    {contact.phone && <p dir="ltr" className="text-start text-sm text-text-muted">{contact.phone}</p>}
                    {contact.email && <p dir="ltr" className="break-all text-start text-sm text-text-muted">{contact.email}</p>}
                    <p className="text-xs text-text-muted">{formatDate(contact.created_at, context.timezone)}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-background">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.contacts.name}</th>
                      <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.contacts.phone}</th>
                      <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.contacts.email}</th>
                      <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.contacts.created}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-text">{contact.full_name || ar.common.unknown}</td>
                        <td dir="ltr" className="px-4 py-3 text-start text-text-muted">{contact.phone || ar.common.unknown}</td>
                        <td dir="ltr" className="px-4 py-3 text-start text-text-muted">{contact.email || ar.common.unknown}</td>
                        <td className="px-4 py-3 text-xs text-text-muted">{formatDate(contact.created_at, context.timezone)}</td>
                      </tr>
                    ))}
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
