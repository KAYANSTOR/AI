import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SetupForm } from './setup-form'
import { BUSINESS_TYPES } from '@/lib/capabilities/business-types'
import { ar } from '@/lib/i18n/ar'

export default async function SetupPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()

  const { data: typeCaps } = await supabase
    .from('business_type_capabilities')
    .select('business_type_id, capability_id, is_default, capabilities(id, name, description)')

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
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.setup.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.setup.description}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <SetupForm
          types={BUSINESS_TYPES.map((type) => ({ id: type.id, name: type.label, description: type.hint }))}
          initialTypeId={context.businessTypeId}
          capsByType={capsByType}
          enabledIds={context.enabledCapabilities}
        />
      </div>
    </div>
  )
}
