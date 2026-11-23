import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { getVertical, type VerticalLabels } from '@/lib/verticals/registry'
import { VerticalSettingsForm } from './vertical-settings-form'

export const dynamic = 'force-dynamic'

export default async function VerticalSettingsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  if (!['owner', 'admin'].includes(context.role)) redirect('/dashboard/settings')

  const db = await createClient()
  const { data } = await db.from('organizations').select('business_type,vertical_config')
    .eq('id', context.organizationId).maybeSingle()
  const vertical = getVertical(String(context.businessTypeId ?? data?.business_type ?? 'custom'))
  const config = (data?.vertical_config ?? {}) as Record<string, unknown>
  const rawLabels = (config.labels ?? {}) as Partial<VerticalLabels>
  const labels: VerticalLabels = { ...vertical.labels, ...rawLabels }
  const prompt = typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
    ? config.systemPrompt
    : vertical.defaultSystemPrompt

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-text">إعداد النشاط والوكيل</h1>
        <p className="mt-1 text-sm leading-6 text-text-muted">يُبنى الإعداد على القطاع المحدد، ويمكن تخصيص التسميات وتعليمات النشاط من هنا.</p>
      </header>
      <VerticalSettingsForm
        verticalName={vertical.nameAr}
        engine={vertical.baseEngine}
        modules={[...vertical.enabledModules]}
        initialPrompt={prompt}
        initialLabels={labels}
      />
    </div>
  )
}
