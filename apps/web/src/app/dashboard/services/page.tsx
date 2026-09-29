import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ServiceForm } from './service-form'
import { ServiceList } from './service-list'
import { ar } from '@/lib/i18n/ar'

export default async function ServicesPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const { data: services } = await supabase
    .from('services')
    .select('id, name, description, duration_minutes, price_amount, price_currency, is_active')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.services.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.services.description}</p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-1">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-text">{ar.services.addTitle}</h2>
            <ServiceForm organizationId={context.organizationId} />
          </div>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <ServiceList services={services ?? []} organizationId={context.organizationId} />
        </div>
      </div>
    </div>
  )
}
