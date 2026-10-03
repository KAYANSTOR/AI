import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { DashboardHeader } from '@/components/dashboard/overview/dashboard-header'
import {
  DashboardKpiSection,
  DashboardKpiSkeleton,
} from '@/components/dashboard/overview/dashboard-kpi-section'
import {
  DashboardActivitySection,
  DashboardActivitySkeleton,
} from '@/components/dashboard/overview/dashboard-activity-section'
import {
  DashboardAgentHealthSection,
  DashboardAgentHealthSkeleton,
} from '@/components/dashboard/overview/dashboard-agent-health-section'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      {/* 1. Instant Shell Header (0ms TTFB) */}
      <DashboardHeader
        organizationName={context.organizationName}
        setupComplete={context.setupComplete}
      />

      {/* 2. Granular Suspense Stream: Core KPIs & Performance Metrics */}
      <Suspense fallback={<DashboardKpiSkeleton />}>
        <DashboardKpiSection organizationId={context.organizationId} />
      </Suspense>

      {/* 3. Granular Suspense Stream: Live Customer Interactions & Upcoming Schedule */}
      <Suspense fallback={<DashboardActivitySkeleton />}>
        <DashboardActivitySection
          organizationId={context.organizationId}
          timezone={context.timezone}
        />
      </Suspense>

      {/* 4. Granular Suspense Stream: Agent Intelligence & Connected Channels */}
      <Suspense fallback={<DashboardAgentHealthSkeleton />}>
        <DashboardAgentHealthSection
          organizationId={context.organizationId}
          enabledCapabilities={context.enabledCapabilities}
        />
      </Suspense>
    </div>
  )
}
