import type { Metadata } from 'next'
import { Sidebar } from '@/components/Sidebar'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

/** Every dashboard page is per-session and per-tenant, so it must render on each request. */
export const dynamic = 'force-dynamic'

/** Incomplete tenants may still open setup pages; a banner links back to onboarding. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  return (
    <DashboardShell
      userEmail={context.email ?? context.phone ?? 'حساب هاتفي'}
      organizationName={context.organizationName}
      sidebar={
        <Sidebar
          orgName={context.organizationName}
          role={context.role}
          enabledCapabilities={context.enabledCapabilities}
        />
      }
    >
      {!context.setupComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-light/60 px-4 py-3 text-sm text-text">
          <span>
            <span className="font-semibold">بقيت خطوات التفعيل اللاحقة.</span> اربط قناة التواصل وجهّز الوكيل واختبره قبل استقبال العملاء.
          </span>
          <Link href="/onboarding/activation" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-dark">
            قائمة التفعيل
          </Link>
        </div>
      )}
      {children}
    </DashboardShell>
  )
}
