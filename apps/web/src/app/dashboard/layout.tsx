import { Suspense } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  
  if (!context.setupComplete) {
    redirect('/onboarding')
  }

  return (
    <DashboardShell
      sidebar={
        <Suspense fallback={<SidebarFallback />}>
          <DashboardSidebar />
        </Suspense>
      }
    >
      {children}
    </DashboardShell>
  )
}

async function DashboardSidebar() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  return (
    <Sidebar
      orgName={context.organizationName}
      role={context.role}
      enabledCapabilities={context.enabledCapabilities}
    />
  )
}

function SidebarFallback() {
  return (
    <aside className="hidden h-dvh w-64 shrink-0 animate-pulse border-e border-border bg-surface p-5 motion-reduce:animate-none lg:block">
      <div className="h-8 w-36 rounded bg-background" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-10 rounded bg-background" />
        ))}
      </div>
    </aside>
  )
}

function SetupBannerFallback() {
  return (
    <div className="motion-safe:animate-pulse h-12 rounded-xl border border-border bg-surface" aria-hidden="true" />
  )
}
