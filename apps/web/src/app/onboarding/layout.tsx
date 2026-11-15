import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  // If completely active, go to dashboard
  if (context.setupComplete) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-surface shadow-lg rounded-2xl border border-border p-6 sm:p-10">
        {children}
      </div>
    </div>
  )
}
