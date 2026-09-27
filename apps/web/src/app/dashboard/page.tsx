import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, Calendar, MessageCircle, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()

  const [
    { count: leadsCount },
    { count: contactsCount },
    { count: appointmentsCount },
    { count: conversationsCount },
    { data: upcoming },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId).gte('starts_at', new Date().toISOString()),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId),
    supabase
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name), services(name)')
      .eq('organization_id', org.organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Overview</h1>
        <p className="mt-1 text-sm text-text-muted">
          {org.organizationName} · Phase 2: AI Receptionist foundation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Leads" value={String(leadsCount ?? 0)} icon={Users} />
        <StatCard title="Contacts" value={String(contactsCount ?? 0)} icon={MessageCircle} />
        <StatCard title="Upcoming" value={String(appointmentsCount ?? 0)} icon={Calendar} />
        <StatCard title="Conversations" value={String(conversationsCount ?? 0)} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-text">Phase checklist</h2>
          <ul className="space-y-2 text-sm">
            <CheckItem done label="Phase 1: Auth, RLS, CRM, services, appointments" />
            <CheckItem done label="Phase 2: Vapi webhook + tool execution layer" />
            <CheckItem done label="Phase 2: WhatsApp webhook + idempotency + eligibility" />
            <CheckItem done label="Phase 2: Unified inbox UI" />
            <CheckItem done={false} label="Phase 2: Connect Vapi number + Meta app credentials" />
            <CheckItem done={false} label="Phase 3: Follow-up engine" />
          </ul>
          <p className="text-xs text-slate-500 mt-4">
            Webhooks:            <code className="rounded bg-slate-100 px-1">/api/vapi/webhook</code> ·{' '}
            <code className="rounded bg-slate-100 px-1">/api/whatsapp/webhook</code>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-text">Upcoming</h2>
          <div className="space-y-3">
            {!upcoming?.length ? (
              <p className="text-sm text-slate-400">No upcoming appointments</p>
            ) : (
              upcoming.map((a) => {
                const contact = a.contacts as unknown as { full_name: string | null } | null
                const service = a.services as unknown as { name: string } | null
                return (                    <div key={a.id} className="flex items-start gap-3 rounded-lg p-3 hover:bg-background">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light/40 text-sm font-medium text-primary-dark">
                      {(contact?.full_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{contact?.full_name || 'Contact'}</p>
                      <p className="text-xs text-slate-500">
                        {service?.name || 'Service'} · {new Date(a.starts_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <Link href="/dashboard/services" className="mt-4 inline-block text-sm font-medium text-primary-dark hover:underline">
            Manage services →
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-muted">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Icon size={20} className="text-primary-dark" />
        </div>
      </div>
      <h4 className="text-3xl font-bold text-slate-900 tracking-tight">{value}</h4>
    </div>
  )
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? 'bg-success/20 text-text' : 'bg-slate-100 text-slate-400'}`}>
        {done ? '✓' : '·'}
      </span>
      <span className={done ? 'text-slate-800' : 'text-slate-500'}>{label}</span>
    </li>
  )
}
