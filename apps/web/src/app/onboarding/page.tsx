import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { SetupWizard } from './setup-wizard'
import type { DayInput } from '@/app/dashboard/hours/actions'

export const metadata: Metadata = {
  title: 'إعداد النشاط | Kayan AI',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

export const dynamic = 'force-dynamic'

function validStep(value: unknown): 1 | 2 | 3 | 4 {
  const step = Number(value)
  return step === 2 || step === 3 || step === 4 ? step : 1
}

export default async function OnboardingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()

  const [profileResult, businessResult, serviceResult, locationResult, hoursResult] = await Promise.all([
    db.from('business_profiles')
      .select('business_id, business_type_id, timezone, onboarding_step')
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    context.businessId
      ? db.from('businesses').select('name, city, website_url').eq('id', context.businessId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('services').select('name, category, duration_minutes, price_amount')
      .eq('organization_id', context.organizationId).order('created_at').limit(1).maybeSingle(),
    context.businessId
      ? db.from('business_locations').select('id, name, address, metadata')
          .eq('business_id', context.businessId).order('created_at').limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('business_hours').select('day_of_week, open_time, close_time, is_closed')
      .eq('organization_id', context.organizationId).order('day_of_week'),
  ])

  const hourRows = hoursResult.data ?? []
  const hoursByDay = new Map(hourRows.map((row) => [Number(row.day_of_week), row]))
  const days: DayInput[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = hoursByDay.get(dayOfWeek)
    return {
      dayOfWeek,
      openTime: String(row?.open_time ?? '09:00:00').slice(0, 5),
      closeTime: String(row?.close_time ?? '17:00:00').slice(0, 5),
      isClosed: row ? Boolean(row.is_closed) : true,
    }
  })
  const location = locationResult.data
  const metadata = location?.metadata as { phone?: string } | null
  const service = serviceResult.data
  const business = businessResult.data
  const onboardingStep = profileResult.error ? 1 : validStep(profileResult.data?.onboarding_step)

  return (
    <main className="min-h-full px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto mb-7 max-w-2xl text-center">
        <p className="text-sm font-bold text-primary">Kayan AI</p>
        <p className="mt-2 text-xs text-text-muted">إعداد مساحة عملك</p>
      </div>
      {profileResult.error || businessResult.error || serviceResult.error || locationResult.error ? (
        <p role="status" className="mx-auto mb-4 max-w-2xl rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          قد تحتاج قاعدة البيانات إلى تطبيق الترحيل 0043 قبل حفظ بيانات الإعداد الجديدة.
        </p>
      ) : null}
      <SetupWizard
        step={onboardingStep}
        data={{
          organizationName: context.organizationName,
          businessName: business?.name ?? context.organizationName,
          businessTypeId: profileResult.data?.business_type_id ?? context.businessTypeId ?? '',
          city: business?.city ?? '',
          websiteUrl: business?.website_url ?? '',
          service: service ? {
            name: String(service.name),
            category: String(service.category ?? ''),
            duration: Number(service.duration_minutes),
            price: service.price_amount === null ? null : Number(service.price_amount),
          } : null,
          location: location ? {
            id: String(location.id),
            name: String(location.name),
            address: String(location.address ?? ''),
            phone: String(metadata?.phone ?? ''),
          } : null,
          days,
          timezone: profileResult.data?.timezone && profileResult.data.timezone !== 'UTC'
            ? profileResult.data.timezone
            : 'Asia/Aden',
          canManage: context.role === 'owner' || context.role === 'admin',
        }}
      />
    </main>
  )
}
