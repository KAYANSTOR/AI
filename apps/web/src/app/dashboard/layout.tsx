import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { getCurrentOrg } from '@/lib/org'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      <Sidebar orgName={org.organizationName} role={org.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
