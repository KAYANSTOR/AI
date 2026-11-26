import type { Metadata } from 'next'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/current-user'
import { EmailVerificationBanner } from '@/components/dashboard/email-verification-banner'

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const user = await getCurrentUser()
  const verifyBanner = user?.email && !user.emailVerifiedAt ? <EmailVerificationBanner email={user.email} /> : null

  const onboardingBanner = !context.setupComplete ? (
    <div data-tour-target="setup" className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/15 px-3 py-3 text-xs text-text">
      <span className="min-w-0 leading-5">
        <strong className="block font-extrabold">أكمل إعداد نشاطك</strong>
        <span className="text-text-muted">اربط القناة وجهّز الوكيل قبل التشغيل.</span>
      </span>
      <Link href="/onboarding" className="shrink-0 rounded-xl bg-primary-dark px-3 py-2 font-bold text-primary-dark-foreground">متابعة</Link>
    </div>
  ) : null
  const setupBanner = verifyBanner || onboardingBanner ? (
    <div className="space-y-2">{verifyBanner}{onboardingBanner}</div>
  ) : null

  return (
    <DashboardShell
      organizationName={context.organizationName}
      businessTypeId={context.businessTypeId}
      timezone={context.timezone}
      personalAssistantEnabled={context.personalAssistantEnabled}
      enabledCapabilities={context.enabledCapabilities}
      role={context.role}
      setupComplete={context.setupComplete}
      tourIdentity={context.organizationId + ':' + context.userId + ':' + context.businessTypeId + ':' + context.personalAssistantEnabled}
      setupBanner={setupBanner}
    >
      {children}
    </DashboardShell>
  )
}
