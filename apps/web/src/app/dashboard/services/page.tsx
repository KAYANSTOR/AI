import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ServiceForm } from './service-form'
import { ServiceList } from './service-list'

export default async function ServicesPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('organization_id', org.organizationId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Services</h1>
        <p className="text-slate-500 text-sm mt-1">
          Services the AI can quote and book. Prices must match reality — the AI cannot invent them.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Add service</h2>
            <ServiceForm organizationId={org.organizationId} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <ServiceList services={services ?? []} organizationId={org.organizationId} />
        </div>
      </div>
    </div>
  )
}
