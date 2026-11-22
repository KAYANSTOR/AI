import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { DashboardKpiSection, DashboardKpiSkeleton } from '@/components/dashboard/overview/dashboard-kpi-section'
import { HomeServicesGrid } from '@/components/dashboard/overview/home-services-grid'
import { DashboardActivitySection, DashboardActivitySkeleton } from '@/components/dashboard/overview/dashboard-activity-section'
import { DashboardAgentHealthSection, DashboardAgentHealthSkeleton } from '@/components/dashboard/overview/dashboard-agent-health-section'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardKpiSkeleton />}>
        <DashboardKpiSection organizationId={context.organizationId} />
      </Suspense>
      <HomeServicesGrid enabledCapabilities={context.enabledCapabilities} />
      <Suspense fallback={<DashboardActivitySkeleton />}>
        <DashboardActivitySection organizationId={context.organizationId} timezone={context.timezone} />
      </Suspense>
      <Suspense fallback={<DashboardAgentHealthSkeleton />}>
        <DashboardAgentHealthSection organizationId={context.organizationId} enabledCapabilities={context.enabledCapabilities} />
      </Suspense>
    </div>
  )
}
