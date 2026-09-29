import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/i18n/format'

export default async function WorkflowsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, name, status, trigger_type, version, updated_at, published_at')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">سير العمل</h1>
        <p className="mt-1 text-sm text-text-muted">
          أتمتة محدودة: محفّز → شرط/انتظار/إشعار → إيقاف. النشر للإدارة فقط.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!workflows?.length ? (
          <div className="p-10 text-center text-sm text-text-muted">لا توجد سير عمل بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">المحفّز</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الحالة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الإصدار</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">تحديث</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text">{wf.name}</td>
                  <td className="px-4 py-3 text-text-muted">{wf.trigger_type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary-light/30 px-2 py-0.5 text-xs text-primary-dark">
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{wf.version}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {formatDate(wf.updated_at, context.timezone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
