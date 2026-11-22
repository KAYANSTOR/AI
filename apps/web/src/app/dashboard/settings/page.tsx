import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import { SettingsHub } from './settings-hub'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()
  const [{ data: allCaps }, snapshot] = await Promise.all([
    db.from('capabilities').select('id, name, description').order('name'),
    loadBillingSnapshot(db, context.organizationId),
  ])
  const enabledMap = new Map(context.enabledCapabilities.map((id) => [id, true]))
  const capabilityRows = (allCaps ?? []).map((capability) => ({
    id: String(capability.id),
    name: capability.name || capability.id,
    description: capability.description ?? '',
    enabled: enabledMap.get(String(capability.id)) ?? false,
  }))
  const plan = PLAN_CATALOG.find((item) => item.code === snapshot.planCode)
  const statusLabels: Record<string, string> = {
    active: 'نشط',
    trial: 'تجريبي',
    past_due: 'متأخر',
    grace_period: 'مهلة سماح',
    suspended: 'موقوف',
    cancelled: 'ملغي',
  }

  return (
    <SettingsHub
      organizationName={context.organizationName}
      accountId={context.organizationId}
      accountIdentity={context.email ?? context.phone ?? 'حساب مساحة العمل'}
      role={context.role}
      setupComplete={context.setupComplete}
      planName={plan?.name ?? snapshot.planCode}
      subscriptionStatus={statusLabels[snapshot.status] ?? snapshot.status}
      capabilityRows={capabilityRows}
      isAdmin={context.role === 'owner' || context.role === 'admin'}
    />
  )
}
