import { getDashboardContext } from '@/lib/dashboard/context'
import { redirect } from 'next/navigation'
import { Wizard } from './wizard'
import { ar } from '@/lib/i18n/ar'

/** The activation wizard reads the tenant's own activation state: never prerender it. */
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">معالج إعداد الحساب</h1>
        <p className="mt-1 text-sm text-text-muted">
          مرحباً بك في النظام! يرجى إكمال الخطوات التالية لتفعيل مساحة العمل الخاصة بك.
        </p>
      </div>

      <Wizard 
        initialStep={context.activationStep} 
        activationState={context.activationState}
        smokeTestStatus={context.smokeTestStatus}
      />
    </div>
  )
}
