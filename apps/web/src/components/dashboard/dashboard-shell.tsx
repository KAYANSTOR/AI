'use client'

import { Suspense } from 'react'
import { Header } from '@/components/Header'
import { NavigationProgress } from './navigation-progress'
import { MobileTabBar } from './mobile-tab-bar'
import { OfflineBanner } from './offline-banner'

export function DashboardShell({
  children,
  setupBanner,
  userEmail,
  organizationName,
  timezone,
}: {
  children: React.ReactNode
  setupBanner?: React.ReactNode
  userEmail: string
  organizationName: string
  timezone: string
}) {
  return (
    <div className="dashboard-viewport" dir="rtl">
      <OfflineBanner />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="dashboard-app-shell">
        <Header userEmail={userEmail} organizationName={organizationName} timezone={timezone} />
        {setupBanner ? <div className="dashboard-setup-banner">{setupBanner}</div> : null}
        <main className="dashboard-main-scroll" id="dashboard-main">
          <div className="dashboard-page-content animate-page-enter">{children}</div>
        </main>
        <MobileTabBar />
      </div>
    </div>
  )
}
