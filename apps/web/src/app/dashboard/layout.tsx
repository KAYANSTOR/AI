import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { getCurrentOrg } from '@/lib/org'
import { getOrgProfile } from '@/lib/capabilities/profile'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const profile = await getOrgProfile(org.organizationId)

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      <Sidebar
        orgName={org.organizationName}
        role={org.role}
        enabledCapabilities={profile.enabledCapabilities}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            {!profile.setupComplete && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
                Complete{' '}
                <Link href="/dashboard/setup" className="font-semibold underline">
                  business setup
                </Link>{' '}
                to load the right modules for your industry.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
