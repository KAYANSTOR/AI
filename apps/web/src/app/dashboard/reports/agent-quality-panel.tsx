import { revalidatePath } from 'next/cache'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'

async function updateCsat(formData: FormData) {
  'use server'
  const context = await getDashboardContext()
  const enabled = formData.get('enabled')
  if (!context || !['owner', 'admin'].includes(context.role) || (enabled !== 'true' && enabled !== 'false')) return
  const db = await createClient()
  const { error } = await db.from('organizations').update({ conversation_csat_enabled: enabled === 'true' }).eq('id', context.organizationId)
  if (error) throw new Error('csat_settings_update_failed')
  revalidatePath('/dashboard/reports')
}

function score(positive: number, total: number) {
  return total > 0 ? `${Math.round(100 * positive / total)}%` : '—'
}

export async function AgentQualityPanel() {
  const context = await getDashboardContext()
  if (!context) return null
  const db = await createClient()
  const [quality, settings] = await Promise.all([
    db.rpc('agent_quality_summary', { p_org_id: context.organizationId }).single(),
    db.from('organizations').select('conversation_csat_enabled').eq('id', context.organizationId).maybeSingle(),
  ])
  const data = quality.data
  const enabled = settings.data?.conversation_csat_enabled === true
  const metrics = [
    { label: 'الحل التلقائي', positive: data?.auto_resolved, total: data?.resolved },
    { label: 'نجاح المهام', positive: data?.tasks_completed, total: data?.tasks },
    { label: 'رضا العميل (CSAT)', positive: data?.positive_ratings, total: data?.ratings },
  ]
  return (
    <section aria-labelledby="agent-quality" className="space-y-3 rounded-2xl border border-primary bg-white p-4 text-primary-dark">
      <h2 id="agent-quality" className="type-heading-3">جودة الوكيل خلال آخر 30 يوماً</h2>
      {quality.error ? <p role="alert">تعذّر تحميل مؤشرات الجودة.</p> : (
        <dl className="grid gap-2 sm:grid-cols-3">
          {metrics.map(metric => (
            <div key={metric.label} className="rounded-xl bg-primary p-3">
              <dt className="text-sm font-semibold">{metric.label}</dt>
              <dd className="text-xl font-extrabold">{score(Number(metric.positive ?? 0), Number(metric.total ?? 0))}</dd>
              <dd className="text-xs">{Number(metric.positive ?? 0)} من {Number(metric.total ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}
      {['owner', 'admin'].includes(context.role) && !settings.error && (
        <form action={updateCsat} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <button className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-primary-dark" type="submit">
            {enabled ? 'إيقاف سؤال التقييم' : 'تفعيل سؤال التقييم'}
          </button>
          <p className="text-sm">اختياري ويُرسل بعد إغلاق محادثة واتساب ضمن نافذة Meta.</p>
        </form>
      )}
    </section>
  )
}
