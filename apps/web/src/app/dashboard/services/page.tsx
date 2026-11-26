import { requireCapability, CapabilityDisabledError, NotAuthorizedError } from '@/lib/capabilities/guard'
import { createClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'
import { ServiceForm } from './service-form'
import { ServiceList } from './service-list'
import { ar } from '@/lib/i18n/ar'

export default async function ServicesPage() {
  let context
  try {
    context = await requireCapability('appointments')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard')
    if (error instanceof NotAuthorizedError) redirect('/login')
    throw error
  }

  const db = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'
  const { data: services } = await db
    .from('services')
    .select('id, name, category, description, duration_minutes, price_amount, price_currency, is_active')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.services.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.services.description}</p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        {canManage && <div className="min-w-0 lg:col-span-1">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-text">{ar.services.addTitle}</h2>
            <ServiceForm organizationId={context.organizationId} />
          </div>
        </div>}
        <div className={canManage ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-3"}>
          <ServiceList services={services ?? []} canManage={canManage} />
        </div>
      </div>
    </div>
  )
}
