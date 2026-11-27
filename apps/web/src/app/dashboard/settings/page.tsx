import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { loadBillingSnapshot } from '@/lib/billing/entitlements'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import { SettingsHub } from './settings-hub'
import { isPersonalWorkspace } from '@/lib/dashboard/navigation-policy'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()
  const personal = isPersonalWorkspace(context)
  const [capabilities, snapshot] = await Promise.all([
    personal ? null : db.from('capabilities').select('id, name, description').order('name'),
    loadBillingSnapshot(db, context.organizationId),
  ])
  if (capabilities?.error) {
    console.error('dashboard_settings_capabilities_failed')
    throw new Error('settings_load_failed')
  }
  const enabledMap = new Map(context.enabledCapabilities.map((id) => [id, true]))
  const capabilityRows = (capabilities?.data ?? []).map((capability) => ({
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
      accountIdentity={context.email ?? context.phone ?? 'الحساب'}
      role={context.role}
      setupComplete={context.setupComplete}
      planName={plan?.name ?? 'باقة مخصصة'}
      subscriptionStatus={statusLabels[snapshot.status] ?? 'حالة غير معروفة'}
      capabilityRows={capabilityRows}
      isAdmin={context.role === 'owner' || context.role === 'admin'}
      personalAssistantEnabled={context.personalAssistantEnabled}
      personal={personal}
    />
  )
}
