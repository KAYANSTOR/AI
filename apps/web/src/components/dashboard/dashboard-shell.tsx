'use client'

import { Suspense } from 'react'
import { Header } from '@/components/Header'
import { NavigationProgress } from './navigation-progress'
import { MobileTabBar } from './mobile-tab-bar'
import { OfflineBanner } from './offline-banner'
import { DashboardTour } from './dashboard-tour'
import { DashboardEntrySplash } from './dashboard-entry-splash'
import { canSearchBusiness } from '@/lib/dashboard/navigation-policy'

export function DashboardShell({
  children,
  setupBanner,
  organizationName,
  businessTypeId,
  timezone,
  personalAssistantEnabled = false,
  enabledCapabilities,
  role,
  setupComplete,
  tourIdentity,
}: {
  children: React.ReactNode
  setupBanner?: React.ReactNode
  organizationName: string
  businessTypeId: string | null
  timezone: string
  personalAssistantEnabled?: boolean
  enabledCapabilities: string[]
  role: string
  setupComplete: boolean
  tourIdentity: string
}) {
  return (
    <div className="dashboard-viewport" dir="rtl">
      <DashboardEntrySplash />
      <OfflineBanner />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="dashboard-app-shell">
        <Header organizationName={organizationName} businessTypeId={businessTypeId} timezone={timezone} showBusinessSearch={canSearchBusiness({ businessTypeId, enabledCapabilities })} />
        {setupBanner ? <div className="dashboard-setup-banner">{setupBanner}</div> : null}
        <main className="dashboard-main-scroll" id="dashboard-main">
          <div className="dashboard-page-content animate-page-enter"><DashboardTour key={tourIdentity} storageKey={tourIdentity} access={{ businessTypeId, personalAssistantEnabled, enabledCapabilities, role, setupComplete }} />{children}</div>
        </main>
      </div>
      {/* Fixed to the viewport, outside the overflow-hidden app frame. */}
      <MobileTabBar businessTypeId={businessTypeId} personalAssistantEnabled={personalAssistantEnabled} enabledCapabilities={enabledCapabilities} role={role} />
    </div>
  )
}
