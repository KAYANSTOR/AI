import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SetupForm } from './setup-form'

export default async function SetupPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()

  const [{ data: types }, { data: profile }, { data: enabled }, { data: typeCaps }] =
    await Promise.all([
      supabase.from('business_types').select('id, name, description').order('name'),
      supabase
        .from('business_profiles')
        .select('business_type_id')
        .eq('organization_id', org.organizationId)
        .maybeSingle(),
      supabase
        .from('organization_capabilities')
        .select('capability_id')
        .eq('organization_id', org.organizationId)
        .eq('is_enabled', true),
      supabase
        .from('business_type_capabilities')
        .select('business_type_id, is_default, capabilities(id, name, description)'),
    ])

  const capsByType: Record<
    string,
    Array<{ id: string; name: string; description: string | null; is_default: boolean }>
  > = {}

  for (const row of typeCaps ?? []) {
    const bt = row.business_type_id as string
    const c = row.capabilities as unknown as {
      id: string
      name: string
      description: string | null
    }
    if (!capsByType[bt]) capsByType[bt] = []
    capsByType[bt].push({
      id: c.id,
      name: c.name,
      description: c.description,
      is_default: Boolean(row.is_default),
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Business setup</h1>
        <p className="text-slate-500 text-sm mt-1">
          Choose your activity type. FrontDesk AI loads the right modules — one core product, not a
          separate app per industry.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <SetupForm
          types={types ?? []}
          initialTypeId={profile?.business_type_id ?? null}
          capsByType={capsByType}
          enabledIds={(enabled ?? []).map((e) => e.capability_id as string)}
        />
      </div>
    </div>
  )
}
