import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CapabilityManager } from './capability-manager'

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()

  const [{ data: profile }, { data: allCaps }, { data: orgCaps }] = await Promise.all([
    supabase
      .from('business_profiles')
      .select('business_type_id, industry, timezone, business_types(name)')
      .eq('organization_id', org.organizationId)
      .maybeSingle(),
    supabase.from('capabilities').select('id, name, description').order('name'),
    supabase
      .from('organization_capabilities')
      .select('capability_id, is_enabled')
      .eq('organization_id', org.organizationId),
  ])

  const enabledMap = new Map(
    (orgCaps ?? []).map((c) => [c.capability_id as string, Boolean(c.is_enabled)])
  )

  const rows = (allCaps ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    description: (c.description as string | null) ?? null,
    enabled: enabledMap.get(c.id as string) ?? false,
  }))

  const bt = profile?.business_types as unknown as { name: string } | null

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Organization profile and capability modules (PLAN: Capability Manager).
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Business profile</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Organization</dt>
            <dd className="font-medium text-slate-900">{org.organizationName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Your role</dt>
            <dd className="font-medium text-slate-900 capitalize">{org.role}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Business type</dt>
            <dd className="font-medium text-slate-900">
              {bt?.name ?? profile?.business_type_id ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Timezone</dt>
            <dd className="font-medium text-slate-900">{profile?.timezone ?? 'UTC'}</dd>
          </div>
        </dl>
        <Link
          href="/dashboard/setup"
          className="inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Change business type & defaults →
        </Link>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Capability Manager</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enable only what this business needs. AI tools for disabled modules are blocked.
          </p>
        </div>
        <CapabilityManager rows={rows} />
      </section>
    </div>
  )
}
