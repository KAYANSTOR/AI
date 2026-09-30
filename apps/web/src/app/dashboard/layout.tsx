import { Suspense } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import Link from 'next/link'

/**
 * Everything under /dashboard is per-session and per-tenant and must be rendered on every
 * request. Without this the segment is only dynamic by accident — while the Supabase env is
 * absent at build time getCurrentOrg() short-circuits before it reads cookies, so Next.js
 * prerenders the whole area into a static redirect that is then served to signed-in users.
 */
export const dynamic = 'force-dynamic'

/**
 * During activation the wizard deep-links into operational surfaces
 * (channels, agent, hours, …). Those routes live under /dashboard, so a hard
 * redirect back to /onboarding would trap the user. Incomplete tenants can
 * use setup pages; the home page surfaces a resume banner instead.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  return (
    <DashboardShell
      sidebar={
        <Suspense fallback={<SidebarFallback />}>
          <DashboardSidebar />
        </Suspense>
      }
    >
      {!context.setupComplete && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          <span className="font-medium">الإعداد غير مكتمل.</span>{' '}
          أكمل معالج التفعيل قبل استقبال العملاء.
          <Link href="/onboarding" className="ms-2 font-semibold text-primary-dark underline">
            العودة للمعالج
          </Link>
        </div>
      )}
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
