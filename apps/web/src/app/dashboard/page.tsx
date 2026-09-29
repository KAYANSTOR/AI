import { Users, Calendar, MessageCircle, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { formatDateTime, formatNumber } from '@/lib/i18n/format'
import { ar } from '@/lib/i18n/ar'
import { capabilityLabel } from '@/lib/i18n/labels'

export default async function DashboardPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const supabase = await createClient()

  const [
    { count: leadsCount },
    { count: contactsCount },
    { count: appointmentsCount },
    { count: conversationsCount },
    { data: upcoming },
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).gte('starts_at', new Date().toISOString()),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    supabase
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name), services(name)')
      .eq('organization_id', context.organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.dashboard.overview}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {context.organizationName} · {ar.dashboard.welcome}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={ar.dashboard.stats.leads} value={leadsCount ?? 0} icon={Users} />
        <StatCard title={ar.dashboard.stats.contacts} value={contactsCount ?? 0} icon={MessageCircle} />
        <StatCard title={ar.dashboard.stats.upcoming} value={appointmentsCount ?? 0} icon={Calendar} />
        <StatCard title={ar.dashboard.stats.conversations} value={conversationsCount ?? 0} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">{ar.dashboard.setupTitle}</h2>
              <p className="mt-1 text-sm text-text-muted">
                {context.setupComplete ? ar.dashboard.setupComplete : ar.dashboard.setupIncomplete}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${context.setupComplete ? 'bg-success/15 text-text' : 'bg-warning/15 text-text'}`}>
              {context.setupComplete ? ar.common.complete : ar.common.notSet}
            </span>
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-text">{ar.dashboard.enabledCapabilities}</h3>
          {context.enabledCapabilities.length ? (
            <ul className="flex flex-wrap gap-2">
              {context.enabledCapabilities.map((id) => (
                <li key={id} className="rounded-full bg-primary-light/30 px-3 py-1 text-xs text-primary-dark">
                  {capabilityLabel(id)}
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/dashboard/setup" className="text-sm font-medium text-primary-dark underline">
              {ar.dashboard.setupLink}
            </Link>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">{ar.dashboard.upcomingTitle}</h2>
          <div className="space-y-2">
            {!upcoming?.length ? (
              <p className="text-sm text-text-muted">{ar.dashboard.noUpcoming}</p>
            ) : (
              upcoming.map((appointment) => {
                const contact = appointment.contacts as unknown as { full_name: string | null } | null
                const service = appointment.services as unknown as { name: string } | null
                return (
                  <div key={appointment.id} className="flex min-w-0 items-start gap-3 rounded-lg p-3 hover:bg-background">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light/40 text-sm font-medium text-primary-dark">
                      {(contact?.full_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {contact?.full_name || ar.contacts.empty}
                      </p>
                      <p className="text-xs text-text-muted">
                        {service?.name || ar.services.title} · {formatDateTime(appointment.starts_at, context.timezone)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <Link href="/dashboard/appointments" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary-dark hover:underline">
            {ar.appointments.title} <span aria-hidden="true" className="rtl:rotate-180">→</span>
          </Link>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: number
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-muted">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Icon size={20} className="text-primary-dark" />
        </div>
      </div>
      <h4 className="text-3xl font-bold tracking-tight text-text">{formatNumber(value)}</h4>
    </div>
  )
}
