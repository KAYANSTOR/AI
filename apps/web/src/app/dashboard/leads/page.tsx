import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ar } from '@/lib/i18n/ar'
import { formatDate, formatNumber } from '@/lib/i18n/format'
import { LeadStatusControl } from './lead-status-control'

export default async function LeadsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const canEdit = context.role !== 'read_only'
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select(
      'id, status, intent, estimated_value, created_at, next_action, source, source_channel, contact_id, contacts(full_name, phone)'
    )
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.leads.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.leads.description}</p>
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!leads?.length ? (
          <div className="p-10 text-center text-sm text-text-muted">{ar.leads.empty}</div>
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {leads.map((lead) => {
                const contact = lead.contacts as unknown as {
                  full_name: string | null
                  phone: string | null
                } | null
                return (
                  <li key={lead.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text">
                          {contact?.full_name || ar.leads.unknownContact}
                        </p>
                        {contact?.phone && (
                          <p dir="ltr" className="text-start text-sm text-text-muted">
                            {contact.phone}
                          </p>
                        )}
                      </div>
                      <LeadStatusControl leadId={lead.id} status={lead.status} canEdit={canEdit} />
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm text-text-muted">
                      <span>{lead.intent || ar.common.unknown}</span>
                      <span>
                        {lead.estimated_value != null
                          ? formatNumber(String(lead.estimated_value))
                          : ar.common.unknown}
                      </span>
                    </div>
                    {(lead.next_action || lead.source) && (
                      <p className="text-xs text-text-muted">
                        {[lead.source, lead.source_channel, lead.next_action].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-text-muted">
                      {formatDate(lead.created_at, context.timezone)}
                    </p>
                  </li>
                )
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-background">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.leads.contact}</th>
                    <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.leads.status}</th>
                    <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.leads.intent}</th>
                    <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.leads.value}</th>
                    <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.leads.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const contact = lead.contacts as unknown as {
                      full_name: string | null
                      phone: string | null
                    } | null
                    return (
                      <tr key={lead.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-text">
                            {contact?.full_name || ar.leads.unknownContact}
                          </div>
                          {contact?.phone && (
                            <div dir="ltr" className="text-start text-xs text-text-muted">
                              {contact.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <LeadStatusControl leadId={lead.id} status={lead.status} canEdit={canEdit} />
                        </td>
                        <td className="px-4 py-3 text-text-muted">
                          {lead.intent || ar.common.unknown}
                        </td>
                        <td dir="ltr" className="px-4 py-3 text-start text-text-muted">
                          {lead.estimated_value != null
                            ? formatNumber(String(lead.estimated_value))
                            : ar.common.unknown}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {formatDate(lead.created_at, context.timezone)}
                        </td>
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
  )
}
