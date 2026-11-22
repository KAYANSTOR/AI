import type { Metadata } from 'next'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const setupBanner = !context.setupComplete ? (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/15 px-3 py-3 text-xs text-text">
      <span className="min-w-0 leading-5">
        <strong className="block font-extrabold">أكمل إعداد نشاطك</strong>
        <span className="text-text-muted">اربط القناة وجهّز الوكيل قبل التشغيل.</span>
      </span>
      <Link href="/onboarding" className="shrink-0 rounded-xl bg-primary-dark px-3 py-2 font-bold text-primary">متابعة</Link>
    </div>
  ) : null

  return (
    <DashboardShell
      userEmail={context.email ?? context.phone ?? 'حساب مساحة العمل'}
      organizationName={context.organizationName}
      timezone={context.timezone}
      setupBanner={setupBanner}
    >
      {children}
    </DashboardShell>
  )
}
