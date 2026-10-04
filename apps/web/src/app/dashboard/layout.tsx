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
        <Sidebar
          orgName={context.organizationName}
          role={context.role}
          enabledCapabilities={context.enabledCapabilities}
        />
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
