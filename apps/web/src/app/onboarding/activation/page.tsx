import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { ActivationChecklist } from './activation-checklist'

export const metadata: Metadata = {
  title: 'قائمة التفعيل | Kayan AI',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

export const dynamic = 'force-dynamic'

export default async function ActivationPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()
  const [profileResult, channelResult, agentResult] = await Promise.all([
    db.from('business_profiles').select('onboarding_step, activation_state')
      .eq('organization_id', context.organizationId).maybeSingle(),
    db.from('channels').select('id').eq('organization_id', context.organizationId).eq('is_active', true).limit(1),
    db.from('ai_agents').select('id').eq('organization_id', context.organizationId).eq('status', 'active').limit(1),
  ])
  if (profileResult.error || Number(profileResult.data?.onboarding_step ?? 1) < 4) redirect('/onboarding')

  return <ActivationChecklist status={{
    channel: Boolean(channelResult.data?.length),
    agent: Boolean(agentResult.data?.length),
    active: profileResult.data?.activation_state === 'active',
    canManage: context.role === 'owner' || context.role === 'admin',
  }} />
}
