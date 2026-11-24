'use client'

import { Suspense } from 'react'
import { Header } from '@/components/Header'
import { NavigationProgress } from './navigation-progress'
import { MobileTabBar } from './mobile-tab-bar'
import { OfflineBanner } from './offline-banner'
import { DashboardEntrySplash } from './dashboard-entry-splash'

export function DashboardShell({
  children,
  setupBanner,
  organizationName,
  businessTypeId,
  timezone,
  personalAssistantEnabled = false,
}: {
  children: React.ReactNode
  setupBanner?: React.ReactNode
  organizationName: string
  businessTypeId: string | null
  timezone: string
  personalAssistantEnabled?: boolean
}) {
  return (
    <div className="dashboard-viewport" dir="rtl">
      <DashboardEntrySplash />
      <OfflineBanner />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="dashboard-app-shell">
        <Header organizationName={organizationName} businessTypeId={businessTypeId} timezone={timezone} />
        {setupBanner ? <div className="dashboard-setup-banner">{setupBanner}</div> : null}
        <main className="dashboard-main-scroll" id="dashboard-main">
          <div className="dashboard-page-content animate-page-enter">{children}</div>
        </main>
      </div>
      {/* Fixed to the viewport, outside the overflow-hidden app frame. */}
      <MobileTabBar businessTypeId={businessTypeId} personalAssistantEnabled={personalAssistantEnabled} />
    </div>
  )
}
